import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { BookingRow } from "../db/schema.js";

export function fail(c: Context, status: ContentfulStatusCode, message: string) {
  return c.json({ error: message }, status);
}

/** ISO 8601 in UTC, dropping zero milliseconds so "2026-12-10T09:00:00Z" round-trips unchanged. */
export function iso(d: Date): string {
  return d.toISOString().replace(/\.000Z$/, "Z");
}

export function toBooking(row: BookingRow) {
  return {
    id: row.id,
    slot_id: row.slotId,
    name: row.name,
    email: row.email,
    status: row.status,
    created_at: iso(row.createdAt),
  };
}
