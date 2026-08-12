import { describe, expect, it } from "vitest";
import { indexRecipeEditorBatchCandidates } from "../services/recipeEditorBatchService";

describe("recipe editor batch response indexing", () => {
  it("maps one independent result per expected source ID", () => {
    const result = indexRecipeEditorBatchCandidates([
      { source_recipe_id: "recipe-b", name: "B" },
      { source_recipe_id: "recipe-a", name: "A" }
    ], ["recipe-a", "recipe-b"]);

    expect(result.candidates.get("recipe-a")?.name).toBe("A");
    expect(result.candidates.get("recipe-b")?.name).toBe("B");
    expect(result.errors.size).toBe(0);
  });

  it("isolates duplicate, omitted, and unexpected IDs", () => {
    const result = indexRecipeEditorBatchCandidates([
      { source_recipe_id: "recipe-a", name: "A1" },
      { source_recipe_id: "recipe-a", name: "A2" },
      { source_recipe_id: "other", name: "Other" }
    ], ["recipe-a", "recipe-b"]);

    expect(result.candidates.size).toBe(0);
    expect(result.errors.get("recipe-a")).toBe("duplicate_source_recipe_id");
    expect(result.errors.get("recipe-b")).toBe("missing_source_recipe_id");
    expect(result.unexpectedIds).toEqual(["other"]);
  });

  it("rejects a malformed top-level response", () => {
    expect(() => indexRecipeEditorBatchCandidates({}, ["recipe-a"])).toThrow("must be an array");
  });
});
