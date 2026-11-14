import type { MiddlewareHandler } from "hono";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const limiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  analytics: true,
  prefix: "clinic-api",
});

export const rateLimitMiddleware: MiddlewareHandler = async (
  c,
  next,
) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const { success, limit, remaining, reset } =
    await limiter.limit(ip);

  c.header("X-RateLimit-Limit", String(limit));
  c.header("X-RateLimit-Remaining", String(remaining));
  c.header("X-RateLimit-Reset", String(reset));

  if (!success) {
    return c.json(
      {
        error: "Too many requests",
        message: "Please try again later.",
      },
      429,
    );
  }

  await next();
};