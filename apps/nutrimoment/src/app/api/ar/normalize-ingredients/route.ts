import { z } from "zod";
import { accessErrorResponse, getRequestAccess } from "@/services/authService";
import { normalizeArabicInputs } from "@/services/arabic/ingredients";

// Input support stays available when Arabic output is disabled. No AI or content writes.
export async function POST(request: Request) {
  try {
    await getRequestAccess(request);
    const parsed = z.object({ ingredients: z.array(z.string().min(1).max(300)).max(60) }).safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Check the ingredient list." }, { status: 400 });
    const result = await normalizeArabicInputs(parsed.data.ingredients);
    if (result.unclear.length) return Response.json({ code: "INGREDIENT_CLARIFICATION_REQUIRED", error: "Please clarify these ingredient names before generating.", items: result.unclear }, { status: 422 });
    return Response.json(result);
  } catch (error) { return accessErrorResponse(error); }
}
