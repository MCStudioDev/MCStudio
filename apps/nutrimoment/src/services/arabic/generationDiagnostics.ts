export type ArabicDishStage = "selection" | "planning" | "generation" | "validation" | "verification" | "repair" | "publication";
export interface ArabicDishDiagnostic {
  candidateId?: string;
  name?: string;
  stage: ArabicDishStage;
  status: "selected" | "accepted" | "rejected" | "repaired";
  issues: string[];
}

const recoverablePlanningIssues = new Set(["dish_ingredients_changed", "pantry_mismatch", "unsupported_dish", "excluded_dish",
  "dish_omitted", "invalid_ingredient_manifest", "invalid_manifest_response"]);
export function arabicPlanningFeedback(items: ArabicDishDiagnostic[]) {
  const feedback = boundedArabicDiagnostics(items).filter(item => item.stage === "planning" && item.status === "rejected"
    && item.issues.some(issue => recoverablePlanningIssues.has(issue))).map(({ name, issues }) => ({ name, issues }));
  return [...new Map(feedback.map(item => [JSON.stringify(item), item])).values()].slice(-20);
}

/** Store bounded codes and dish identities, never provider prompts or raw output. */
export function boundedArabicDiagnostics(items: ArabicDishDiagnostic[]): ArabicDishDiagnostic[] {
  return items.slice(-150).map(item => ({
    ...(item.candidateId && /^dish-[a-f0-9]{24}$/.test(item.candidateId) ? { candidateId: item.candidateId } : {}),
    ...(item.name ? { name: item.name.replace(/[\u0000-\u001f]/g, "").slice(0, 180) } : {}),
    stage: item.stage, status: item.status,
    issues: item.issues.slice(0, 12).map(issue => issue.split(":").slice(0, /^(canonical|arabic):/.test(issue) ? 2 : 1).join(":").replace(/[^a-z0-9_:]/gi, "").slice(0, 80))
  }));
}
