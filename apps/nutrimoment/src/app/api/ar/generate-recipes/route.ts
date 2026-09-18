import { handleArabicGeneration } from "@/services/arabic/generation";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(request: Request) { return handleArabicGeneration(request, "recipes"); }
