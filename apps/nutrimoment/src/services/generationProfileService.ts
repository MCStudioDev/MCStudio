import { getAdminDb } from "@/lib/firebaseAdmin";
import { parseSavedRestrictions, ProfileUnavailableError } from "@/lib/profileSafety";

/** Never accept a client-supplied empty diet as evidence that a signed-in user is unrestricted. */
export async function loadGenerationRestrictions(uid: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const snapshot = await Promise.race([
      getAdminDb().doc(`users/${uid}/profile/health`).get(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new ProfileUnavailableError()), 10_000);
      })
    ]);
    if (!snapshot.exists) throw new ProfileUnavailableError();
    return parseSavedRestrictions(snapshot.data());
  } catch {
    throw new ProfileUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}
