import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { db, type Tx } from "../db/client.js";
import { bookings, idempotencyKeys, slots } from "../db/schema.js";
import { fail, toBooking } from "../lib/format.js";
import { takeBookingAttempt } from "../lib/rate-limit.js";

const bookingsRouter = new Hono();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Outcome = { status: ContentfulStatusCode; body: unknown };

class RateLimited extends Error {
  constructor(readonly retryAfter: number) {
    super("rate limited");
  }
}

const err = (status: ContentfulStatusCode, error: string): Outcome => ({ status, body: { error } });

/** Key-order-independent JSON so `{"a":1,"b":2}` and `{"b":2,"a":1}` count as the same body. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as any)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const hashBody = (body: unknown) => createHash("sha256").update(canonical(body)).digest("hex");

function emailOf(body: unknown): string | undefined {
  const raw = (body as any)?.email;
  if (typeof raw !== "string") return undefined;
  return raw.trim().toLowerCase() || undefined;
}

/** Validation and the actual booking. Runs inside a transaction. */
async function createBooking(tx: Tx, body: unknown): Promise<Outcome> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return err(400, "body must be a JSON object");
  }
  const { slot_id, name } = body as Record<string, unknown>;
  const email = emailOf(body);

  if (typeof slot_id !== "string" || !slot_id.trim()) return err(400, "slot_id is required");
  if (typeof name !== "string" || !name.trim()) return err(400, "name is required");
  if (!email) return err(400, "email is required");
  if (!EMAIL_RE.test(email)) return err(400, "email is not valid");

  // Locking the slot row (SELECT ... FOR UPDATE) serialises every booking attempt
  // for this slot, so simultaneous requests are decided one at a time.
  const [slot] = await tx
    .select({ id: slots.id, startAt: slots.startAt })
    .from(slots)
    .where(eq(slots.id, slot_id.trim()))
    .for("update");
  if (!slot) return err(404, "slot not found");
  if (slot.startAt.getTime() <= Date.now()) return err(400, "slot has already started");

  const [taken] = await tx
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.slotId, slot.id), eq(bookings.status, "confirmed")))
    .limit(1);
  if (taken) return err(409, "slot is already booked");

  const [row] = await tx
    .insert(bookings)
    .values({ id: randomUUID(), slotId: slot.id, name: name.trim(), email, status: "confirmed" })
    .returning();
  return { status: 201, body: toBooking(row) };
}

type Stored = { requestHash: string; statusCode: number; response: unknown };

async function findStored(key: string): Promise<Stored | undefined> {
  const [row] = await db()
    .select({
      requestHash: idempotencyKeys.requestHash,
      statusCode: idempotencyKeys.statusCode,
      response: idempotencyKeys.response,
    })
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key));
  return row;
}

function replay(stored: Stored, hash: string): Outcome {
  if (stored.requestHash !== hash) {
    return err(422, "Idempotency-Key was already used with a different body");
  }
  return { status: stored.statusCode as ContentfulStatusCode, body: stored.response };
}

/** Walks the error chain: drizzle wraps driver errors, so the Postgres code may sit on `cause`. */
function isDoubleBooking(e: unknown): boolean {
  for (let cur: any = e; cur; cur = cur.cause) {
    if (cur.code === "23505" && cur.constraint_name === "bookings_one_confirmed_per_slot") return true;
  }
  return false;
}

bookingsRouter.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, 400, "body must be valid JSON");
  }

  const key = c.req.header("Idempotency-Key")?.trim() || undefined;
  const hash = hashBody(body);
  const send = (o: Outcome) => c.json(o.body as object, o.status);

  // A retry of a finished request is answered from storage. It doesn't count as a new attempt.
  if (key) {
    const stored = await findStored(key);
    if (stored) return send(replay(stored, hash));
  }

  const email = emailOf(body);

  let outcome: Outcome | "replay";
  try {
    outcome = await db().transaction(async (tx) => {
      if (key) {
        // If another request with this key is in flight, this insert waits for it to commit,
        // then does nothing, and we replay its stored response below. Claiming the key before
        // the rate limit means simultaneous retries of one request count as a single attempt.
        const claimed = await tx
          .insert(idempotencyKeys)
          .values({ key, requestHash: hash, statusCode: 0, response: {} })
          .onConflictDoNothing({ target: idempotencyKeys.key })
          .returning({ key: idempotencyKeys.key });
        if (!claimed.length) return "replay" as const;
      }

      if (email) {
        const limit = await takeBookingAttempt(tx, email);
        // Throwing rolls back the key claim, so a later retry is judged afresh instead of replaying a 429.
        if (!limit.ok) throw new RateLimited(limit.retryAfter);
      }

      const result = await createBooking(tx, body);

      if (key) {
        await tx
          .update(idempotencyKeys)
          .set({ statusCode: result.status, response: result.body })
          .where(eq(idempotencyKeys.key, key));
      }
      return result;
    });
  } catch (e) {
    if (e instanceof RateLimited) {
      c.header("Retry-After", String(e.retryAfter));
      return fail(c, 429, "too many booking attempts for this email, try again later");
    }
    // The partial unique index is the last line of defence against double booking.
    if (isDoubleBooking(e)) return fail(c, 409, "slot is already booked");
    throw e;
  }

  if (outcome === "replay") {
    const stored = await findStored(key!);
    if (!stored) return fail(c, 409, "a request with this Idempotency-Key is still in progress");
    return send(replay(stored, hash));
  }
  return send(outcome);
});

bookingsRouter.get("/", async (c) => {
  const email = c.req.query("email")?.trim().toLowerCase();
  if (!email) return fail(c, 400, "email is required");

  let limit = 10;
  const rawLimit = c.req.query("limit");
  if (rawLimit !== undefined) {
    if (!/^\d+$/.test(rawLimit)) return fail(c, 400, "limit must be an integer from 1 to 50");
    limit = Number(rawLimit);
    if (limit < 1 || limit > 50) return fail(c, 400, "limit must be an integer from 1 to 50");
  }

  // The cursor is the opaque, base64url-encoded position of the last booking returned.
  let after: number | undefined;
  const cursor = c.req.query("cursor");
  if (cursor) {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    if (!/^\d+$/.test(decoded)) return fail(c, 400, "cursor is not valid");
    after = Number(decoded);
  }

  const rows = await db()
    .select()
    .from(bookings)
    .where(and(eq(bookings.email, email), after !== undefined ? gt(bookings.seq, after) : undefined))
    .orderBy(asc(bookings.seq))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const next_cursor =
    rows.length > limit ? Buffer.from(String(page[page.length - 1].seq)).toString("base64url") : null;

  return c.json({ bookings: page.map(toBooking), next_cursor });
});

bookingsRouter.get("/:id", async (c) => {
  const [row] = await db().select().from(bookings).where(eq(bookings.id, c.req.param("id")));
  if (!row) return fail(c, 404, "booking not found");
  return c.json(toBooking(row));
});

bookingsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const d = db();

  const [row] = await d
    .update(bookings)
    .set({ status: "cancelled" })
    .where(and(eq(bookings.id, id), eq(bookings.status, "confirmed")))
    .returning();
  if (row) return c.json(toBooking(row));

  const [existing] = await d.select({ id: bookings.id }).from(bookings).where(eq(bookings.id, id));
  if (existing) return fail(c, 409, "booking is already cancelled");
  return fail(c, 404, "booking not found");
});

export default bookingsRouter;
