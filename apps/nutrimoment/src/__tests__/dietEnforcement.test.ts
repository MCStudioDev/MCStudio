import { describe, expect, it } from "vitest";
import { adaptRecipeForDietRestrictions, findRecipeDietViolation } from "../lib/dietEnforcement";

describe("diet enforcement", () => {
  it("treats dairy-free as blocking dairy but not eggs", () => {
    expect(findRecipeDietViolation(
      { name: "Shakshuka", ingredients: ["eggs", "tomato", "bell pepper", "olive oil"] },
      { diets: ["dairyFree"], allergens: [] }
    )).toBeNull();

    expect(
      findRecipeDietViolation(
        { name: "Greek yogurt bowl", ingredients: ["yogurt", "berries"] },
        { diets: ["dairyFree"], allergens: [] }
      )
    ).toEqual({ kind: "diet", diet: "dairyFree", match: "yogurt" });
  });

  it("allows plant-based dairy alternatives for vegan and dairy-free users", () => {
    const ctx = { diets: ["vegan", "dairyFree"], allergens: [] };

    expect(
      findRecipeDietViolation(
        { name: "Broccoli soup", ingredients: ["broccoli", "almond milk", "potato", "garlic"] },
        ctx
      )
    ).toBeNull();
    expect(
      findRecipeDietViolation(
        { name: "Vegan pancakes", ingredients: ["flour", "oat milk", "banana", "cinnamon"] },
        ctx
      )
    ).toBeNull();
    expect(
      findRecipeDietViolation(
        { name: "Thai tofu curry", ingredients: ["tofu", "coconut milk", "vegetables", "basil"] },
        ctx
      )
    ).toBeNull();
    expect(
      findRecipeDietViolation(
        { name: "Mushroom soup", ingredients: ["mushrooms", "coconut cream", "thyme"] },
        ctx
      )
    ).toBeNull();

    expect(findRecipeDietViolation({ name: "Milk soup", ingredients: ["milk", "broccoli"] }, ctx)).toEqual({
      kind: "diet",
      diet: "vegan",
      match: "milk"
    });
    expect(findRecipeDietViolation({ name: "Cream soup", ingredients: ["heavy cream", "broccoli"] }, ctx)).toEqual({
      kind: "diet",
      diet: "vegan",
      match: "cream"
    });
    expect(findRecipeDietViolation({ name: "Yogurt bowl", ingredients: ["yogurt", "berries"] }, ctx)).toEqual({
      kind: "diet",
      diet: "vegan",
      match: "yogurt"
    });
  });

  it("also blocks eggs when egg allergy is selected without dairy-free", () => {
    expect(
      findRecipeDietViolation(
        { name: "Vegetable omelette", ingredients: ["eggs", "spinach"] },
        { diets: [], allergens: ["eggs"] }
      )
    ).toEqual({ kind: "allergen", allergen: "eggs", match: "egg" });
  });

  it("normalizes Arabic custom allergens before checking generated recipes", () => {
    expect(
      findRecipeDietViolation(
        {
          name: "مكرونة بصلصة الطماطم",
          ingredients: ["مكرونة"],
          missing_ingredients: ["صلصة طماطم", "ثوم"]
        },
        { diets: [], allergens: ["الطماطم"] }
      )
    ).toEqual({ kind: "allergen", allergen: "الطماطم", match: "طماطم" });

    expect(
      findRecipeDietViolation(
        { name: "Greek yogurt bowl", ingredients: ["yogurt", "berries"] },
        { diets: [], allergens: ["اللبن"] }
      )
    ).toEqual({ kind: "allergen", allergen: "اللبن", match: "yogurt" });
  });

  it("does not false-positive Arabic pescatarian terms inside safe words", () => {
    const ctx = { diets: ["pescatarian"], allergens: [] };

    expect(findRecipeDietViolation({ name: "سلطة أرز بالحمص", ingredients: ["حمص", "أرز", "طماطم"] }, ctx)).toBeNull();
    expect(findRecipeDietViolation({ name: "فول مع طماطم", ingredients: ["فول", "طماطم", "بصل"] }, ctx)).toBeNull();
    expect(findRecipeDietViolation({ name: "طبق أرز وحمص", ingredients: ["حمص", "أرز", "خيار"] }, ctx)).toBeNull();
  });

  it("blocks real Arabic meat and poultry terms", () => {
    const ctx = { diets: ["pescatarian"], allergens: [] };

    expect(findRecipeDietViolation({ name: "لحم بقري مشوي", ingredients: ["لحم بقري"] }, ctx)).toEqual({
      kind: "diet",
      diet: "pescatarian",
      match: "لحم"
    });
    expect(findRecipeDietViolation({ name: "دجاج مشوي", ingredients: ["دجاج"] }, ctx)).toEqual({
      kind: "diet",
      diet: "pescatarian",
      match: "دجاج"
    });
    expect(findRecipeDietViolation({ name: "بط مشوي", ingredients: ["بط"] }, ctx)).toEqual({
      kind: "diet",
      diet: "pescatarian",
      match: "بط"
    });
  });

  it("blocks Arabic chicken, ground meat, and egg meals for vegan dairy-free users", () => {
    const ctx = { diets: ["vegan", "vegetarian", "dairyFree"], allergens: [] };

    expect(findRecipeDietViolation({ name: "سلطة دجاج مشوي بالليمون", ingredients: ["دجاج", "ليمون"] }, ctx)).toEqual({
      kind: "diet",
      diet: "vegan",
      match: "دجاج"
    });
    expect(findRecipeDietViolation({ name: "مكرونة باللحم المفروم", ingredients: ["لحم مفروم", "طماطم"] }, ctx)).toEqual({
      kind: "diet",
      diet: "vegan",
      match: "لحم"
    });
    expect(findRecipeDietViolation({ name: "فريتاتا بالسبانخ والبيض", ingredients: ["بيض", "سبانخ"] }, ctx)).toEqual({
      kind: "diet",
      diet: "vegan",
      match: "بيض"
    });
  });

  it("treats keto as a hard low-carb ingredient gate", () => {
    const ctx = { diets: ["keto"], allergens: [] };

    expect(findRecipeDietViolation({ name: "Chicken rice bowl", ingredients: ["chicken", "rice", "broccoli"] }, ctx)).toEqual({
      kind: "diet",
      diet: "keto",
      match: "rice"
    });
    expect(findRecipeDietViolation({ name: "Shrimp zucchini noodle skillet", ingredients: ["shrimp", "zucchini noodles", "olive oil"] }, ctx)).toBeNull();
    expect(findRecipeDietViolation({ name: "Salmon cauliflower rice bowl", ingredients: ["salmon", "cauliflower rice", "zucchini"] }, ctx)).toBeNull();
  });

  it("treats paleo as a hard grain legume and dairy gate", () => {
    const ctx = { diets: ["paleo"], allergens: [] };

    expect(findRecipeDietViolation({ name: "White bean chicken stew", ingredients: ["chicken", "white beans", "tomato"] }, ctx)).toEqual({
      kind: "diet",
      diet: "paleo",
      match: "bean"
    });
    expect(findRecipeDietViolation({ name: "Chicken roasted vegetable plate", ingredients: ["chicken", "zucchini", "carrot"] }, ctx)).toBeNull();
    expect(findRecipeDietViolation({ name: "Greek yogurt bowl", ingredients: ["yogurt", "berries"] }, ctx)).toEqual({
      kind: "diet",
      diet: "paleo",
      match: "yogurt"
    });
  });

  it("allows explicitly gluten-free substitutes while blocking ordinary gluten sources", () => {
    const ctx = { diets: ["glutenFree"], allergens: [] };

    expect(findRecipeDietViolation({
      name: "Gluten-Free Eggplant Parmesan",
      ingredients: ["gluten-free breadcrumbs", "eggplant", "tomato"],
      steps: ["Coat with gluten-free breadcrumbs and bake."]
    }, ctx)).toBeNull();
    expect(findRecipeDietViolation({
      name: "Gluten-Free Polenta with Marinara",
      ingredients: ["polenta", "tomato"],
      steps: ["Serve instead of gluten-free ravioli."]
    }, ctx)).toBeNull();
    expect(findRecipeDietViolation({
      name: "Lisa's gluten-free ravioli Marinara",
      ingredients: ["50 gluten -free ravioli squares", "tomato"],
      steps: ["Serve over cooked gluten-free ravioli."]
    }, ctx)).toBeNull();
    expect(findRecipeDietViolation({ name: "Eggplant Parmesan", ingredients: ["breadcrumbs", "eggplant"] }, ctx)).toEqual({
      kind: "diet",
      diet: "glutenFree",
      match: "breadcrumb"
    });
  });

  it("repairs every remaining gluten carrier before final validation", () => {
    const ctx = { diets: ["glutenFree"], allergens: [] };
    const recipe = adaptRecipeForDietRestrictions({
      name: "Eggplant Pasta",
      ingredients: ["gluten-free pasta", "breadcrumbs", "eggplant"],
      missing_ingredients: ["bread"],
      steps: ["Boil spaghetti, coat with breadcrumbs, and serve with bread."],
      dish_intent: { dish_name: "Eggplant Pasta", visual_keywords: ["pasta plate"] }
    }, ctx);

    expect(recipe.ingredients).toEqual(["gluten-free pasta", "gluten-free breadcrumbs", "eggplant"]);
    expect(recipe.steps[0]).toContain("gluten-free spaghetti");
    expect(recipe.steps[0]).toContain("gluten-free breadcrumbs");
    expect(findRecipeDietViolation(recipe, ctx)).toBeNull();
  });

  it("adapts incompatible meat variants consistently for a pescatarian recipe", () => {
    const ctx = {
      diets: ["pescatarian"],
      allergens: [],
      preferredProteinIngredients: ["shrimp", "white fish"]
    };
    const adapted = adaptRecipeForDietRestrictions({
      name: "Thai Chicken Pineapple Fried Rice",
      ingredients: ["chicken", "rice", "pineapple", "chicken stock"],
      missing_ingredients: ["bacon"],
      steps: [
        "Brown the chicken, add chicken stock, and finish with crisp bacon."
      ],
      dish_intent: {
        dish_name: "Thai Chicken Pineapple Fried Rice",
        visual_keywords: ["chicken fried rice"]
      }
    }, ctx);

    expect(adapted.name).toBe("Thai shrimp Pineapple Fried Rice");
    expect(adapted.ingredients).toContain("shrimp");
    expect(adapted.ingredients).toContain("low-sodium vegetable stock");
    expect(adapted.steps[0]).not.toMatch(/chicken|bacon/i);
    expect(findRecipeDietViolation(adapted, ctx)).toBeNull();
  });

  it("adapts dairy ingredients consistently before the dairy-free safety gate", () => {
    const ctx = { diets: ["dairyFree"], allergens: [] };
    const adapted = adaptRecipeForDietRestrictions({
      name: "Manti with Yogurt Sauce",
      ingredients: ["yogurt", "butter", "milk", "ground beef"],
      missing_ingredients: ["feta cheese"],
      steps: ["Whisk the yogurt with milk, then finish the sauce with butter and feta cheese."]
    }, ctx);

    expect(adapted.ingredients).toContain("dairy-free unsweetened yogurt");
    expect(adapted.ingredients).toContain("olive oil");
    expect(adapted.ingredients).toContain("unsweetened almond milk");
    expect(findRecipeDietViolation(adapted, ctx)).toBeNull();
  });

  it("adapts documented carbohydrate carriers before the keto safety gate", () => {
    const ctx = { diets: ["keto", "dairyFree"], allergens: [] };
    const adapted = adaptRecipeForDietRestrictions({
      name: "Cig Kofte with Pita",
      ingredients: ["bulgur", "bread flour", "yogurt", "ground beef", "potato"],
      missing_ingredients: ["bread"],
      steps: ["Mix bulgur with yogurt, shape it, and serve with pita bread."],
      dish_intent: { dish_name: "Cig Kofte", visual_keywords: ["bulgur kofte plate"] }
    }, ctx);

    expect(adapted.ingredients).toContain("cauliflower rice");
    expect(adapted.ingredients).toContain("finely ground almonds");
    expect(adapted.ingredients).toContain("dairy-free unsweetened yogurt");
    expect(adapted.ingredients).toContain("cauliflower florets");
    expect(adapted.steps[0]).toContain("low-carb flatbread");
    expect(findRecipeDietViolation(adapted, ctx)).toBeNull();
  });

  it("adapts animal and dairy ingredients before the vegan safety gate", () => {
    const ctx = {
      diets: ["vegan"],
      allergens: [],
      preferredProteinIngredients: ["lentils", "chickpeas"]
    };
    const adapted = adaptRecipeForDietRestrictions({
      name: "Creamy Chicken Curry",
      ingredients: ["chicken", "ghee", "heavy cream", "egg", "honey"],
      missing_ingredients: ["fish sauce"],
      steps: ["Brown the chicken in ghee, then add cream, egg, honey, and fish sauce."]
    }, ctx);

    expect(adapted.ingredients).toContain("chickpeas");
    expect(adapted.ingredients).toContain("olive oil");
    expect(adapted.ingredients).toContain("unsweetened coconut cream");
    expect(adapted.ingredients).toContain("ground flaxseed slurry");
    expect(findRecipeDietViolation(adapted, ctx)).toBeNull();
  });

  it("does not duplicate or leave broken named-cheese fragments in vegan substitutions", () => {
    const ctx = { diets: ["vegan"], allergens: [] };
    const adapted = adaptRecipeForDietRestrictions({
      name: "Pasta alla Norma",
      ingredients: ["1/2 cup parmesan cheese", "1/2 cup ricotta salata"],
      steps: ["Top with parmesan cheese and ricotta salata before serving."]
    }, ctx);

    expect(adapted.ingredients).toEqual([
      "1/2 cup dairy-free cheese",
      "1/2 cup plant-based ricotta alternative"
    ]);
    expect(adapted.steps[0]).not.toMatch(/dairy-free cheese dairy-free cheese|dairy-free cheese salata/i);
  });

  it("converts counted eggs into a measurable flax slurry without egg grammar", () => {
    const ctx = { diets: ["vegan"], allergens: [] };
    const adapted = adaptRecipeForDietRestrictions({
      name: "Breaded Eggplant",
      ingredients: ["2 large eggs, beaten"],
      steps: ["Dip each slice into 2 beaten eggs before breading."]
    }, ctx);

    expect(adapted.ingredients).toEqual(["2 tbsp ground flaxseed mixed with 5 tbsp water"]);
    expect(adapted.steps[0]).toContain("2 tbsp ground flaxseed mixed with 5 tbsp water");
    expect(adapted.steps[0]).not.toMatch(/egg|beaten ground flaxseed/i);
  });

  it("removes cured pork and pecorino from vegan source text", () => {
    const ctx = { diets: ["vegan"], allergens: [] };
    const adapted = adaptRecipeForDietRestrictions({
      name: "Spaghetti Carbonara",
      ingredients: ["4 oz guanciale or pancetta", "1/2 cup Pecorino Romano"],
      steps: ["Crisp the guanciale or pancetta, then add Pecorino Romano."]
    }, ctx);

    expect(adapted.ingredients.join(" ")).not.toMatch(/guanciale|pancetta|pecorino/i);
    expect(findRecipeDietViolation(adapted, ctx)).toBeNull();
  });

  it("preserves a named dairy dish identity while veganizing its ingredients", () => {
    const ctx = { diets: ["vegan"], allergens: [] };
    const adapted = adaptRecipeForDietRestrictions({
      name: "Palak Paneer",
      ingredients: ["paneer", "spinach", "cream", "ghee"],
      steps: ["Brown the paneer in ghee and finish the spinach sauce with cream."]
    }, ctx);

    expect(adapted.name).toBe("Vegan Palak Paneer");
    expect(adapted.ingredients).toContain("dairy-free cheese");
    expect(findRecipeDietViolation(adapted, ctx)).toBeNull();
  });
});
