import { logger } from "@/lib/logger";

export interface RateLimitConfig {
  /** Max tokens per window. */
  capacity: number;
  /** Refill window in milliseconds. */
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds?: number;
}

interface Bucket {
  tokens: number;
  resetAt: number;
}

/**
 * In-memory fixed-window rate limiter keyed by `bucketKey`.
 *
 * Why an in-memory store: works in single-instance deployments and dev. For
 * multi-instance production, swap `store` with an Upstash Redis adapter that
 * implements the same `consume` contract — the route code does not change.
 */
const store = new Map<string, Bucket>();

const REAPER_INTERVAL_MS = 60_000;
let reaperHandle: ReturnType<typeof setInterval> | null = null;

function ensureReaper(): void {
  if (reaperHandle !== null) return;
  if (typeof setInterval !== "function") return;
  reaperHandle = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of store) {
      if (bucket.resetAt <= now) store.delete(key);
    }
  }, REAPER_INTERVAL_MS);
  if (reaperHandle && typeof reaperHandle === "object" && "unref" in reaperHandle) {
    (reaperHandle as { unref?: () => void }).unref?.();
  }
}

/**
 * Consume a token from the rate-limit bucket. Returns the decision and the
 * remaining quota so callers can attach standard rate-limit response headers.
 */
export function consume(bucketKey: string, config: RateLimitConfig): RateLimitDecision {
  ensureReaper();
  const now = Date.now();
  const existing = store.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + config.windowMs;
    store.set(bucketKey, { tokens: config.capacity - 1, resetAt });
    return { allowed: true, remaining: config.capacity - 1, resetAt };
  }

  if (existing.tokens <= 0) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds
    };
  }

  existing.tokens -= 1;
  return { allowed: true, remaining: existing.tokens, resetAt: existing.resetAt };
}

export function rateLimitHeaders(decision: RateLimitDecision, config: RateLimitConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(config.capacity),
    "X-RateLimit-Remaining": String(Math.max(decision.remaining, 0)),
    "X-RateLimit-Reset": String(Math.floor(decision.resetAt / 1000))
  };
  if (decision.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(decision.retryAfterSeconds);
  }
  return headers;
}

export function rateLimitedResponse(decision: RateLimitDecision, config: RateLimitConfig, message?: string): Response {
  return Response.json(
    {
      error: message ?? "Too many requests. Please slow down and try again shortly.",
      retryAfterSeconds: decision.retryAfterSeconds
    },
    {
      status: 429,
      headers: rateLimitHeaders(decision, config)
    }
  );
}

const FEATURE_LIMITS: Record<string, { premium: RateLimitConfig; free: RateLimitConfig }> = {
  recipe_generation: {
    premium: { capacity: 30, windowMs: 60_000 },
    free: { capacity: 10, windowMs: 60_000 }
  },
  meal_plan: {
    premium: { capacity: 10, windowMs: 60_000 },
    free: { capacity: 3, windowMs: 60_000 }
  },
  image_scan: {
    premium: { capacity: 20, windowMs: 60_000 },
    free: { capacity: 6, windowMs: 60_000 }
  },
  recipe_photo: {
    premium: { capacity: 120, windowMs: 60_000 },
    free: { capacity: 60, windowMs: 60_000 }
  }
};

export type RateLimitedFeature = keyof typeof FEATURE_LIMITS;

export function getFeatureLimit(feature: RateLimitedFeature, isPremium: boolean): RateLimitConfig {
  const limits = FEATURE_LIMITS[feature];
  return isPremium ? limits.premium : limits.free;
}

export interface ApplyRateLimitOptions {
  uid: string;
  feature: RateLimitedFeature;
  isPremium: boolean;
  /** Optional override (e.g. for admin bypass). When true, returns allowed=true without touching the store. */
  bypass?: boolean;
}

export function applyRateLimit(options: ApplyRateLimitOptions): {
  decision: RateLimitDecision;
  config: RateLimitConfig;
} {
  const config = getFeatureLimit(options.feature, options.isPremium);

  if (options.bypass) {
    return {
      decision: { allowed: true, remaining: config.capacity, resetAt: Date.now() + config.windowMs },
      config
    };
  }

  const bucketKey = `${options.feature}:${options.uid}`;
  const decision = consume(bucketKey, config);

  if (!decision.allowed) {
    logger.warn("rate_limit_exceeded", {
      feature: options.feature,
      uid: options.uid,
      tier: options.isPremium ? "premium" : "free",
      retryAfterSeconds: decision.retryAfterSeconds
    });
  }

  return { decision, config };
}
