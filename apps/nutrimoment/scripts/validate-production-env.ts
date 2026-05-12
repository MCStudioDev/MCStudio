import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

type RequiredEnv = {
  description: string;
  name: string;
  validate?: (value: string) => string | null;
};

const requiredEnv: RequiredEnv[] = [
  { name: "NEXT_PUBLIC_FIREBASE_API_KEY", description: "Firebase web API key" },
  { name: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", description: "Firebase auth domain" },
  { name: "NEXT_PUBLIC_FIREBASE_PROJECT_ID", description: "Firebase project ID" },
  { name: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", description: "Firebase Storage bucket" },
  { name: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", description: "Firebase messaging sender ID" },
  { name: "NEXT_PUBLIC_FIREBASE_APP_ID", description: "Firebase web app ID" },
  { name: "NEXT_PUBLIC_FIRESTORE_DATABASE_ID", description: "Firestore database ID" },
  {
    name: "NEXT_PUBLIC_APP_URL",
    description: "Production app URL",
    validate: (value) => {
      try {
        const url = new URL(value);
        if (url.protocol !== "https:") return "must start with https://";
        if (["localhost", "127.0.0.1"].includes(url.hostname)) return "must not point to localhost";
        if (url.hostname.includes("your-production-domain")) return "still uses the placeholder domain";
        return null;
      } catch {
        return "must be a valid absolute URL";
      }
    }
  },
  { name: "FIREBASE_ADMIN_PROJECT_ID", description: "Firebase Admin project ID" },
  { name: "FIREBASE_ADMIN_CLIENT_EMAIL", description: "Firebase Admin client email" },
  {
    name: "FIREBASE_ADMIN_PRIVATE_KEY",
    description: "Firebase Admin private key",
    validate: (value) => (value.includes("BEGIN PRIVATE KEY") ? null : "must contain BEGIN PRIVATE KEY")
  },
  { name: "GEMINI_API_KEY", description: "Gemini API key" },
  { name: "UNSPLASH_ACCESS_KEY", description: "Unsplash access key for recipe photos" }
];

const optionalEnv = [
  { name: "PEXELS_API_KEY", description: "Pexels fallback recipe photo key" },
  { name: "LOG_LEVEL", description: "Server log verbosity" },
  {
    name: "REPLICATE_API_TOKEN",
    description: "Replicate token for premium recipe-image generation; without it premium users fall through to 'no exact photo'"
  },
  {
    name: "REPLICATE_IMAGE_MODEL",
    description: "Replicate model id; defaults to black-forest-labs/flux-schnell when unset"
  }
];

function cleanEnvValue(value: string | undefined) {
  return value?.trim().replace(/^"/, "").replace(/"$/, "");
}

function isPlaceholder(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("your_") ||
    normalized.includes("your-") ||
    normalized.includes("_here") ||
    normalized === "..." ||
    normalized.includes("\n...")
  );
}

const failures: string[] = [];

if (cleanEnvValue(process.env.USE_MOCK_API) === "true") {
  failures.push("USE_MOCK_API=true is set; production deploys must use real providers, not mocks.");
}

for (const item of requiredEnv) {
  const value = cleanEnvValue(process.env[item.name]);

  if (!value) {
    failures.push(`${item.name} is missing (${item.description}).`);
    continue;
  }

  if (isPlaceholder(value)) {
    failures.push(`${item.name} still looks like a placeholder (${item.description}).`);
    continue;
  }

  const validationError = item.validate?.(value);
  if (validationError) {
    failures.push(`${item.name} is invalid: ${validationError}.`);
  }
}

for (const item of optionalEnv) {
  const value = cleanEnvValue(process.env[item.name]);
  if (!value || isPlaceholder(value)) {
    console.warn(`Optional env not configured: ${item.name} (${item.description}).`);
  }
}

if (failures.length > 0) {
  console.error("Production environment check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Production environment check passed.");
