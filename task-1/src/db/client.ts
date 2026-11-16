import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

let instance: Db | undefined;

/** Lazily created so a missing DATABASE_URL surfaces as a clear error on first use. */
export function db(): Db {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const client = postgres(url, {
      // Required for transaction-mode poolers (Neon/Supabase pooled URLs).
      prepare: false,
      max: 5,
      idle_timeout: 20,
      onnotice: () => {},
    });
    instance = drizzle(client, { schema });
  }
  return instance;
}
