import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { logger } from "@/lib/logger";
import type { RequestAccess } from "@/services/authService";

const DEFAULT_DAILY_LIMIT_PER_USER = 100;
const GLOBAL_CONTROL_DOC_PATH = "globalControls/replicateImages";
const GLOBAL_CONTROL_CACHE_TTL_MS = 60_000;

const envDailyLimitPerUser = readPositiveIntegerEnv("REPLICATE_DAILY_LIMIT_PER_USER", DEFAULT_DAILY_LIMIT_PER_USER);

interface GlobalControl {
  enabled: boolean;
  dailyLimitPerUser?: number;
}

interface CachedGlobalControl {
  control: GlobalControl;
  expiresAt: number;
}

let cachedGlobalControl: CachedGlobalControl | null = null;

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function todayKey(): string {
  // YYYY-MM-DD in UTC so rollover behavior is deterministic across regions.
  return new Date().toISOString().slice(0, 10);
}

async function readGlobalControl(): Promise<GlobalControl> {
  const now = Date.now();
  if (cachedGlobalControl && cachedGlobalControl.expiresAt > now) {
    return cachedGlobalControl.control;
  }

  try {
    const snap = await getAdminDb().doc(GLOBAL_CONTROL_DOC_PATH).get();
    const data = snap.data() ?? {};
    // Default to enabled if the doc is missing or the field is absent — the
    // global kill-switch is opt-in (admins flip it off to stop spending).
    const enabled = data.enabled !== false;
    const dailyLimitPerUser =
      typeof data.dailyLimitPerUser === "number" && data.dailyLimitPerUser > 0
        ? data.dailyLimitPerUser
        : undefined;
    const control: GlobalControl = { enabled, dailyLimitPerUser };
    cachedGlobalControl = { control, expiresAt: now + GLOBAL_CONTROL_CACHE_TTL_MS };
    return control;
  } catch (error) {
    // Fail open: if we cannot read the control doc, do not punish premium
    // users. The server-side Replicate billing cap is the hard backstop.
    logger.warn("Failed to read globalControls/replicateImages; defaulting to enabled", {
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    const control: GlobalControl = { enabled: true };
    cachedGlobalControl = { control, expiresAt: now + GLOBAL_CONTROL_CACHE_TTL_MS };
    return control;
  }
}

export type ReplicateCapDecision =
  | {
      allowed: true;
      dailyLimit: number;
      dailyUsed: number;
    }
  | {
      allowed: false;
      reason: "global_disabled" | "per_user_daily_cap_reached";
      dailyLimit: number;
      dailyUsed: number;
    };

/**
 * Decide whether the caller may generate a Replicate image right now.
 *
 * Admins bypass the per-user daily cap but still respect the global kill
 * switch so an oncall can stop spending without locking themselves out
 * of debugging entirely — only the operator who flipped the flag is
 * supposed to flip it back.
 */
export async function isReplicateGenerationAllowedForUser(access: RequestAccess): Promise<ReplicateCapDecision> {
  const control = await readGlobalControl();
  const dailyLimit = control.dailyLimitPerUser ?? envDailyLimitPerUser;

  if (!control.enabled) {
    return { allowed: false, reason: "global_disabled", dailyLimit, dailyUsed: 0 };
  }

  if (access.isAdmin) {
    return { allowed: true, dailyLimit, dailyUsed: 0 };
  }

  const today = todayKey();
  let dailyUsed = 0;
  try {
    const usageRef = getAdminDb().doc(`users/${access.uid}/usage/replicateImages`);
    const snap = await usageRef.get();
    const data = snap.data();
    if (data?.day === today && typeof data.count === "number") {
      dailyUsed = data.count;
    }
  } catch (error) {
    // Fail open on read errors; the post-generation increment below will
    // surface the failure if Firestore is genuinely down.
    logger.warn("Failed to read replicateImages usage; allowing this request", {
      uid: access.uid,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return { allowed: true, dailyLimit, dailyUsed: 0 };
  }

  if (dailyUsed >= dailyLimit) {
    return { allowed: false, reason: "per_user_daily_cap_reached", dailyLimit, dailyUsed };
  }

  return { allowed: true, dailyLimit, dailyUsed };
}

/**
 * Record a successful Replicate generation against the caller's daily counter.
 * Best-effort; logs and swallows errors so a Firestore hiccup does not poison
 * an otherwise-successful image response.
 */
export async function recordReplicateGeneration(access: RequestAccess, dailyLimit: number): Promise<void> {
  if (access.isAdmin) return;

  const today = todayKey();
  const usageRef = getAdminDb().doc(`users/${access.uid}/usage/replicateImages`);
  try {
    const snap = await usageRef.get();
    const data = snap.data();
    const sameDay = data?.day === today;
    await usageRef.set(
      {
        uid: access.uid,
        day: today,
        limit: dailyLimit,
        count: sameDay ? FieldValue.increment(1) : 1,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  } catch (error) {
    logger.warn("Failed to record replicateImages usage", {
      uid: access.uid,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Test/operator helper: force the cached global control to be re-read on the
 * next request. Not used by routes; exported for completeness.
 */
export function resetReplicateGlobalControlCache(): void {
  cachedGlobalControl = null;
}
