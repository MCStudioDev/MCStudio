export class RecipeGeminiCallBudget {
  private phase: string | null = null;

  get callCount() {
    return this.phase ? 1 : 0;
  }

  claim(phase: string) {
    if (this.phase) {
      throw new Error(`Gemini recipe batch call already used by ${this.phase}; rejected ${phase}.`);
    }
    this.phase = phase;
  }
}
