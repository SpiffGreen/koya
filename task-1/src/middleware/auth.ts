import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

import { fail } from "../lib/format.js";

function sameKey(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const expected = process.env.API_KEY;
  const given = c.req.header("X-API-Key");

  if (!expected || !given || !sameKey(given, expected)) {
    return fail(c, 401, "missing or invalid API key");
  }

  await next();
};
