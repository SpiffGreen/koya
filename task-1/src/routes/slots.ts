import { and, asc, eq, exists } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../db/client.js";
import { bookings, slots } from "../db/schema.js";
import { iso } from "../lib/format.js";

const slotsRouter = new Hono();

slotsRouter.get("/", async (c) => {
  const d = db();
  const provider = c.req.query("provider");

  const confirmedBooking = d
    .select({ one: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.slotId, slots.id), eq(bookings.status, "confirmed")));

  const rows = await d
    .select({
      id: slots.id,
      provider: slots.provider,
      startAt: slots.startAt,
      endAt: slots.endAt,
      booked: exists(confirmedBooking).mapWith(Boolean),
    })
    .from(slots)
    .where(provider !== undefined ? eq(slots.provider, provider) : undefined)
    .orderBy(asc(slots.startAt), asc(slots.id));

  return c.json({
    slots: rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      start: iso(r.startAt),
      end: iso(r.endAt),
      available: !r.booked,
    })),
  });
});

export default slotsRouter;
