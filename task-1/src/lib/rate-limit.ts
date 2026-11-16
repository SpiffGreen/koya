import { and, count, eq, gt, lte, min, sql } from "drizzle-orm";

import type { Tx } from "../db/client.js";
import { bookingAttempts } from "../db/schema.js";

export const ATTEMPTS_PER_WINDOW = 5;
const WINDOW_MS = 60_000;

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

/**
 * Sliding-window limit per email, stored in Postgres so it holds across serverless instances.
 * A per-email advisory lock (held until the caller's transaction ends) serialises concurrent
 * attempts, so a burst can't slip past the count.
 * Rejected (429) attempts are not recorded, otherwise a client that keeps retrying would never get back in.
 */
export async function takeBookingAttempt(tx: Tx, email: string): Promise<RateLimitResult> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"booking-attempts:" + email}))`);

  const now = Date.now();
  const windowStart = new Date(now - WINDOW_MS);
  const forEmail = eq(bookingAttempts.email, email);

  await tx.delete(bookingAttempts).where(and(forEmail, lte(bookingAttempts.attemptedAt, windowStart)));

  const [{ n, oldest }] = await tx
    .select({ n: count(), oldest: min(bookingAttempts.attemptedAt) })
    .from(bookingAttempts)
    .where(and(forEmail, gt(bookingAttempts.attemptedAt, windowStart)));

  if (n >= ATTEMPTS_PER_WINDOW && oldest) {
    const waitMs = new Date(oldest).getTime() + WINDOW_MS - now;
    return { ok: false, retryAfter: Math.max(1, Math.ceil(waitMs / 1000)) };
  }

  await tx.insert(bookingAttempts).values({ email, attemptedAt: new Date(now) });
  return { ok: true };
}
