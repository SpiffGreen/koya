import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { bookings, slots } from "../db/schema";
import { db } from "../db/client";

const bookingsRouter = new Hono();

const createBookingSchema = z.object({
  slotId: z.string().uuid(),
  patientName: z.string().min(2).max(150),
  patientEmail: z.string().email(),
});

bookingsRouter.post(
  "/",
  zValidator("json", createBookingSchema),
  async (c) => {
    const body = c.req.valid("json");
    const idempotencyKey = c.req.header("Idempotency-Key");

    if (!idempotencyKey) {
      return c.json({ error: "Idempotency-Key is required" }, 400);
    }

    const result = await db.transaction(async (tx) => {
      const [slot] = await tx
        .select()
        .from(slots)
        .where(eq(slots.id, body.slotId))
        .limit(1);

      if (!slot) return null;

      const [booking] = await tx
        .insert(bookings)
        .values({
          slotId: body.slotId,
          patientName: body.patientName,
          patientEmail: body.patientEmail,
        })
        .returning();

      return booking;
    });

    if (!result) {
      return c.json({ error: "Slot not found" }, 404);
    }

    return c.json(result, 201);
  },
);

bookingsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, id))
    .limit(1);

  if (!booking) {
    return c.json({ error: "Booking not found" }, 404);
  }

  return c.json(booking);
});

export default bookingsRouter;