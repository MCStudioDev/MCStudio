export interface TechniqueClassification {
  technique: string;
  confidence: number;
  signals: string[];
}

const TECHNIQUES: Array<{ technique: string; patterns: RegExp[] }> = [
  { technique: "grill", patterns: [/\b(grill|grilled|broil|barbecue|bbq)\b/i] },
  { technique: "bake", patterns: [/\b(bake|baked|oven|casserole)\b/i] },
  { technique: "braise", patterns: [/\b(braise|stew|simmer|slow cook)\b/i] },
  { technique: "stir_fry", patterns: [/\b(stir fry|stir-fry|wok)\b/i] },
  { technique: "fry", patterns: [/\b(fry|fried|deep fry|deep-fry)\b/i] },
  { technique: "roast", patterns: [/\b(roast|roasted)\b/i] },
  { technique: "steam", patterns: [/\b(steam|steamed)\b/i] },
  { technique: "stuff", patterns: [/\b(stuff|stuffed|filling|filled)\b/i] }
];

export class TechniqueClassifier {
  classify(title: string, directions: string[]): TechniqueClassification[] {
    const text = `${title} ${directions.join(" ")}`.toLowerCase();
    return TECHNIQUES.flatMap(({ technique, patterns }) => {
      const signals = patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
      return signals.length ? [{ technique, confidence: Math.min(100, 55 + signals.length * 25), signals }] : [];
    }).sort((left, right) => right.confidence - left.confidence);
  }
}
