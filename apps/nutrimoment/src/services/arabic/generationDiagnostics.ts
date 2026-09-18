export type ArabicDishStage = "selection" | "planning" | "generation" | "validation" | "verification" | "repair" | "publication";
export interface ArabicDishDiagnostic {
  candidateId?: string;
  name?: string;
  stage: ArabicDishStage;
  status: "selected" | "accepted" | "rejected" | "repaired";
  issues: string[];
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
