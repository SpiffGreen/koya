import { Hono } from "hono";

import { db } from "../db/client.js";
import { bookingAttempts, bookings, idempotencyKeys, slots } from "../db/schema.js";
import { fail } from "../lib/format.js";

const resetRouter = new Hono();

type NewSlot = typeof slots.$inferInsert;

function parseSlots(body: unknown): NewSlot[] | string {
  if (!body || typeof body !== "object" || !Array.isArray((body as any).slots)) {
    return "slots must be an array";
  }
  const seen = new Set<string>();
  const rows: NewSlot[] = [];
  for (const [i, s] of ((body as any).slots as unknown[]).entries()) {
    if (!s || typeof s !== "object") return `slots[${i}] must be an object`;
    const { id, provider, start, end } = s as Record<string, unknown>;
    if (typeof id !== "string" || !id.trim()) return `slots[${i}].id is required`;
    if (typeof provider !== "string" || !provider.trim()) return `slots[${i}].provider is required`;
    if (typeof start !== "string" || Number.isNaN(Date.parse(start))) return `slots[${i}].start must be a date-time`;
    if (typeof end !== "string" || Number.isNaN(Date.parse(end))) return `slots[${i}].end must be a date-time`;
    if (seen.has(id)) return `duplicate slot id ${id}`;
    seen.add(id);
    rows.push({ id, provider, startAt: new Date(start), endAt: new Date(end) });
  }
  return rows;
}

resetRouter.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, 400, "body must be valid JSON");
  }

  const rows = parseSlots(body);
  if (typeof rows === "string") return fail(c, 400, rows);

  await db().transaction(async (tx) => {
    await tx.delete(idempotencyKeys);
    await tx.delete(bookingAttempts);
    await tx.delete(bookings);
    await tx.delete(slots);
    if (rows.length) await tx.insert(slots).values(rows);
  });

  return c.json({ status: "ok", slots: rows.length });
});

export default resetRouter;
