import { Hono } from "hono";
import { and, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "../db/client";
import { slots, bookings } from "../db/schema";

const slotsRouter = new Hono();

slotsRouter.get("/", async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");

  if (!from || !to) {
    return c.json(
      { error: "Both from and to query parameters are required" },
      400,
    );
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);

  if (
    Number.isNaN(fromDate.getTime()) ||
    Number.isNaN(toDate.getTime()) ||
    fromDate >= toDate
  ) {
    return c.json({ error: "Invalid date range" }, 400);
  }

  const availableSlots = await db
    .select({
      id: slots.id,
      startsAt: slots.startsAt,
      endsAt: slots.endsAt,
    })
    .from(slots)
    .where(
      and(
        gte(slots.startsAt, fromDate),
        lte(slots.startsAt, toDate),
        sql`NOT EXISTS (
          SELECT 1 FROM ${bookings}
          WHERE ${bookings.slotId} = ${slots.id}
          AND ${bookings.status} = 'confirmed'
        )`,
      ),
    );

  return c.json({
    data: availableSlots,
    count: availableSlots.length,
  });
});

export default slotsRouter;