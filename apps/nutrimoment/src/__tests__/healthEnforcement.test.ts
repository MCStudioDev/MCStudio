import { describe, expect, it } from "vitest";
import { adaptRecipeForHealthConditions, findRecipeHealthViolation } from "../lib/healthEnforcement";

describe("health enforcement", () => {
  it("adapts a real recipe for health conditions without changing dish identity", () => {
    const recipe = adaptRecipeForHealthConditions(
      {
        name: "Chicken Parmesan",
        cuisine: "Italian",
        ingredients: ["chicken", "butter", "mozzarella", "parmesan", "salt"],
        missing_ingredients: [],
        steps: ["Breaded chicken is fried in butter, topped with mozzarella and parmesan, and seasoned with salt."],
        calories: 760,
        protein: "42g",
        carbs: "44g",
        fat: "36g",
        fiber: "3g",
        sugar: "8g",
        sodium: "980mg",
        cook_time: "35 mins",
        difficulty: "Medium"
      },
      ["cholesterol", "highBloodPressure", "weightLoss"]
    );

    expect(recipe.name).toBe("Chicken Parmesan");
    expect(recipe.ingredients.join(" ")).toMatch(/part-skim mozzarella/i);
    expect(recipe.ingredients.join(" ")).toMatch(/small amount of parmesan/i);
    expect(recipe.ingredients.join(" ")).toMatch(/salt-free seasoning/i);
    expect(recipe.steps.join(" ")).toMatch(/oven-crusted|lightly pan-seared/i);
    expect(recipe.steps.join(" ")).not.toMatch(/Health adaptation/i);
    expect(recipe.fat).toBe("24g");
    expect(recipe.sodium).toBe("620mg");
    expect(recipe.calories).toBe(620);
    expect(findRecipeHealthViolation(recipe, ["cholesterol", "highBloodPressure", "weightLoss"])).toBeNull();
  });

  it("is idempotent when the same health policy is applied at multiple pipeline stages", () => {
    const source = {
      name: "Chicken with broth",
      cuisine: "Global",
      ingredients: ["chicken", "broth", "salt", "parmesan"],
      missing_ingredients: [],
      steps: ["Simmer the chicken in broth and season with salt and parmesan."],
      calories: 520,
      protein: "42g",
      carbs: "20g",
      fat: "18g",
      fiber: "4g",
      sugar: "5g",
      sodium: "820mg",
      cook_time: "30 minutes",
      difficulty: "Easy"
    };

    const once = adaptRecipeForHealthConditions(source, ["cholesterol", "highBloodPressure"]);
    const twice = adaptRecipeForHealthConditions(once, ["cholesterol", "highBloodPressure"]);

    expect(twice).toEqual(once);
    expect(twice.ingredients.join(" ")).not.toMatch(/low-sodium low-sodium|seasoning-free seasoning/i);
  });

  it("aligns cooking and photo method metadata with the health-adapted preparation", () => {
    const recipe = adaptRecipeForHealthConditions({
      name: "Fried Chicken Cacciatore",
      cuisine: "Italian",
      ingredients: ["chicken", "tomato", "olive oil"],
      missing_ingredients: [],
      steps: ["Fry the chicken, then simmer it in tomato sauce."],
      calories: 540,
      protein: "40g",
      carbs: "24g",
      fat: "20g",
      fiber: "5g",
      sugar: "6g",
      sodium: "520mg",
      cook_time: "35 minutes",
      difficulty: "Medium",
      dish_intent: {
        dish_name: "Fried Chicken Cacciatore",
        cuisine: "Italian",
        cooking_method: "fried",
        visual_keywords: ["fried chicken cacciatore"],
        exclude_keywords: []
      },
      photo_identity: {
        dish_slug: "fried-chicken-cacciatore",
        english_name: "Fried Chicken Cacciatore",
        cuisine_key: "italian",
        method: "fried"
      },
      image_search_index: "fried chicken cacciatore plate"
    }, ["cholesterol"]);

    expect(recipe.name).toBe("Fried Chicken Cacciatore");
    expect(recipe.dish_intent?.cooking_method).toBe("lightly pan-seared");
    expect(recipe.photo_identity?.method).toBe("lightly pan-seared");
    expect(findRecipeHealthViolation(recipe, ["cholesterol"])).toBeNull();
  });

  it("blocks rich saturated-fat meals for cholesterol profiles", () => {
    expect(
      findRecipeHealthViolation(
        { name: "Chicken lemon butter sauce", ingredients: ["chicken", "butter", "lemon"] },
        ["cholesterol"]
      )
    ).toEqual({ condition: "cholesterol", match: "butter" });

    expect(
      findRecipeHealthViolation(
        { name: "Vegetable white bean minestrone", ingredients: ["white beans", "tomato", "zucchini"] },
        ["cholesterol", "highBloodPressure", "weightLoss"]
      )
    ).toBeNull();
  });

  it("allows familiar proteins when the preparation and numbers are heart-smart", () => {
    expect(
      findRecipeHealthViolation(
        {
          name: "Lean grilled beef onion flatbread",
          ingredients: ["lean beef", "onion", "whole wheat flatbread", "lemon", "herbs"],
          steps: ["Trim visible fat.", "Grill the beef strips with onion and a small amount of olive oil."],
          calories: 520,
          fat: "18g",
          fiber: "6g",
          sodium: "520mg",
          protein: "36g"
        },
        ["cholesterol", "highBloodPressure"]
      )
    ).toBeNull();

    expect(
      findRecipeHealthViolation(
        {
          name: "Smoked-paprika chicken shawarma-style wrap",
          ingredients: ["skinless chicken", "onion", "whole wheat pita", "smoked paprika", "garlic"],
          steps: ["Use smoked paprika for flavor, not cured smoked meat.", "Bake the chicken and slice it thin."],
          calories: 480,
          fat: "12g",
          fiber: "5g",
          sodium: "560mg",
          protein: "38g"
        },
        ["highCholesterol", "highBloodPressure"]
      )
    ).toBeNull();
  });

  it("allows adapted dairy while still blocking heavy dairy", () => {
    expect(
      findRecipeHealthViolation(
        {
          name: "Low-fat mozzarella vegetable toast",
          ingredients: ["whole grain bread", "low-fat mozzarella", "tomato", "spinach"],
          calories: 390,
          fat: "11g",
          fiber: "6g",
          sodium: "430mg",
          protein: "23g"
        },
        ["cholesterol", "highBloodPressure"]
      )
    ).toBeNull();

    expect(
      findRecipeHealthViolation(
        {
          name: "Creamy cheese pasta",
          ingredients: ["pasta", "cheese", "cream", "butter"],
          calories: 720,
          fat: "36g",
          sodium: "820mg"
        },
        ["cholesterol", "highBloodPressure"]
      )
    ).toEqual({ condition: "cholesterol", match: "butter" });

    expect(
      findRecipeHealthViolation(
        {
          name: "Chicken Alfredo",
          ingredients: ["chicken", "low-fat yogurt", "small amount of parmesan"],
          steps: ["Simmer the light sauce gently and coat the chicken."],
          calories: 520,
          fat: "20g",
          fiber: "4g",
          sodium: "560mg",
          protein: "40g"
        },
        ["cholesterol", "highBloodPressure"]
      )
    ).toBeNull();
  });

  it("allows controlled pan-fried liver when cholesterol numbers are heart-smart", () => {
    expect(
      findRecipeHealthViolation(
        {
          name: "Alexandrian pan-fried kebda",
          ingredients: ["beef liver", "onion", "green pepper", "garlic", "olive oil"],
          steps: ["Lightly pan-fry thin liver slices in a nonstick pan with a small amount of olive oil."],
          calories: 470,
          fat: "18g",
          fiber: "4g",
          sodium: "620mg",
          protein: "34g"
        },
        ["cholesterol", "highBloodPressure"]
      )
    ).toBeNull();

    expect(
      findRecipeHealthViolation(
        {
          name: "Deep fried breaded liver",
          ingredients: ["beef liver", "bread crumbs", "oil"],
          steps: ["Deep fry the breaded liver pieces."],
          calories: 760,
          fat: "38g",
          sodium: "780mg"
        },
        ["cholesterol"]
      )
    ).toEqual({ condition: "cholesterol", match: "fried" });
  });

  it("blocks processed salty foods for high blood pressure profiles", () => {
    expect(
      findRecipeHealthViolation(
        { name: "Pepperoni pasta", ingredients: ["pasta", "pepperoni", "tomato"] },
        ["highBloodPressure"]
      )
    ).toEqual({ condition: "highBloodPressure", match: "pepperoni" });
  });

  it("keeps a sausage dish only after lean, reduced-sodium adaptation", () => {
    const adapted = adaptRecipeForHealthConditions({
      name: "Sujuk",
      cuisine: "Egyptian",
      ingredients: ["sausage", "tomato", "pepper"],
      missing_ingredients: [],
      steps: ["Brown the sausage, then simmer it with tomato and pepper."],
      calories: 620,
      protein: "32g",
      carbs: "24g",
      fat: "34g",
      fiber: "4g",
      sugar: "6g",
      sodium: "920mg",
      cook_time: "30 minutes",
      difficulty: "Easy"
    }, ["cholesterol", "highBloodPressure"]);

    expect(adapted.ingredients.join(" ")).toContain("lean homemade reduced-sodium sausage");
    expect(adapted.fat).toBe("24g");
    expect(adapted.sodium).toBe("620mg");
    expect(findRecipeHealthViolation(adapted, ["cholesterol", "highBloodPressure"])).toBeNull();
  });

  it("blocks heavy fried or creamy meals for weight-loss profiles", () => {
    expect(
      findRecipeHealthViolation(
        { name: "Fried beef cutlet", ingredients: ["beef", "bread crumbs"], dish_intent: { dish_name: "fried beef cutlet", cuisine: "Italian", visual_keywords: [], exclude_keywords: [] } },
        ["weightLoss"]
      )
    ).toEqual({ condition: "weightLoss", match: "fried" });
  });

  it("uses nutrition numbers for diabetes profiles", () => {
    expect(
      findRecipeHealthViolation(
        { name: "Sweet rice bowl", ingredients: ["rice", "dates"], calories: 520, carbs: "78g", sugar: "22g", protein: "8g" },
        ["diabetes"]
      )
    ).toEqual({ condition: "diabetes", match: "sugar>15g" });

    expect(
      findRecipeHealthViolation(
        {
          name: "Chicken whole grain bowl",
          ingredients: ["chicken", "brown rice", "lentils", "vegetables"],
          calories: 560,
          carbs: "58g",
          sugar: "6g",
          fiber: "8g",
          protein: "34g"
        },
        ["diabetes"]
      )
    ).toBeNull();
  });

  it("uses nutrition numbers for low blood pressure profiles", () => {
    expect(
      findRecipeHealthViolation(
        { name: "Tiny cucumber salad", ingredients: ["cucumber", "lettuce"], calories: 180, sodium: "80mg", protein: "4g" },
        ["lowBloodPressure"]
      )
    ).toEqual({ condition: "lowBloodPressure", match: "calories<260" });
  });

  it("uses nutrition numbers for weight-gain profiles", () => {
    expect(
      findRecipeHealthViolation(
        { name: "Light broth", ingredients: ["vegetable broth", "herbs"], calories: 240, protein: "7g" },
        ["weightGain"]
      )
    ).toEqual({ condition: "weightGain", match: "calories<320" });

    expect(
      findRecipeHealthViolation(
        { name: "Chicken avocado rice plate", ingredients: ["chicken", "avocado", "rice"], calories: 390, protein: "28g" },
        ["weightGain"]
      )
    ).toBeNull();
  });

  it("allows numerically compatible health meals", () => {
    expect(
      findRecipeHealthViolation(
        {
          name: "Salmon quinoa vegetable plate",
          ingredients: ["salmon", "quinoa", "broccoli", "olive oil"],
          calories: 540,
          carbs: "38g",
          sugar: "6g",
          sodium: "420mg",
          fat: "18g",
          fiber: "6g",
          protein: "38g"
        },
        ["diabetes", "highBloodPressure", "weightGain", "cholesterol"]
      )
    ).toBeNull();
  });
});
