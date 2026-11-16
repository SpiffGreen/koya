# Clinic Booking API

The API and booking page for Task 1 of the Koya assessment. It follows the spec at
[koyaacademy.com/assessment-api](https://koyaacademy.com/assessment-api) and covers levels 1 to 5.

Stack: [Hono](https://hono.dev) on Vercel Node functions, Postgres via [Drizzle ORM](https://orm.drizzle.team)
and `postgres.js`.

## Endpoints

All API routes live under `/api`, so the API base URL is `https://<host>/api`. Every endpoint below needs the `X-API-Key` header. Errors are always `{"error": "..."}`.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/reset` | `{"slots": [...]}` deletes every booking and replaces all slots |
| `GET` | `/api/slots?provider=` | Every slot, earliest first, with `available` |
| `POST` | `/api/bookings` | `{slot_id, name, email}`, optional `Idempotency-Key` header |
| `GET` | `/api/bookings?email=&limit=&cursor=` | A person's bookings, oldest first, cursor-paginated |
| `GET` | `/api/bookings/:id` | One booking |
| `DELETE` | `/api/bookings/:id` | Cancels it and frees the slot |

`GET /` serves the booking page, outside `/api`. It asks for the API key once and keeps it in that browser.
`GET /api/health` is public.

## How each level is met

- **Level 2:** a constant-time API key check on every route. `POST /bookings` checks its fields in spec
  order: 400 for bad fields, 404 for an unknown slot, 400 for a slot that has already started. `name` and
  `email` are trimmed, and `email` is stored in lower case.
- **Level 3:** a booking locks its slot row (`SELECT … FOR UPDATE`), so simultaneous requests for one slot
  are handled one at a time. A partial unique index on `bookings(slot_id) WHERE status = 'confirmed'` backs
  this up, so a double booking can't happen even through a bug.
- **Level 4:** an `Idempotency-Key` is claimed with `INSERT … ON CONFLICT DO NOTHING` in the same
  transaction as the booking. A simultaneous retry waits for the first request, then gets its stored
  response replayed. Bodies are compared by a key-order-independent hash: the same key with a different
  body returns 422. The pagination cursor is an opaque position in insert order, so it stays stable.
- **Level 5:** a sliding window of 5 attempts per email per 60 seconds, stored in Postgres, so it holds
  across serverless instances. A per-email advisory lock means a burst can't slip past the count. The 6th
  attempt gets 429 with `Retry-After` in whole seconds. Replays of an idempotent request don't count.

## Generate an API key

The key is 32 random bytes from a cryptographically secure source, written as 64 hex characters.
In bash, this generates one and writes it into `.env` (it creates `.env` from the example if needed):

```bash
[ -f .env ] || cp .env.example .env
KEY=$(openssl rand -hex 32)
sed -i "s/^API_KEY=.*/API_KEY=$KEY/" .env    # on macOS: sed -i '' "s/.../.../" .env
```

To print a key without touching `.env`, run `openssl rand -hex 32`. `.env` is git-ignored, so the key
never gets committed. Use the same value for `API_KEY` on Vercel, and send it as the `X-API-Key` header.

## Run locally

```sh
cp .env.example .env          # then set DATABASE_URL, and API_KEY as described above
npm install
npm run db:migrate            # creates the tables
npm run dev                   # page at http://localhost:3000, API at http://localhost:3000/api
```

For a throwaway database:
`docker run -d --name clinic-pg -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=clinic -p 5432:5432 postgres:17-alpine`

## Check every level

```sh
BASE_URL=http://localhost:3000/api API_KEY=... npm run check
```

**Warning:** this calls `POST /api/reset`, which wipes all slots and bookings on that deployment.

## Deploy (Vercel + Neon)

1. Create a Neon project and copy its **pooled** connection string.
2. Apply the schema to it: `DATABASE_URL='<neon url>' npm run db:migrate`
3. Deploy: `npx vercel link`, then
   `npx vercel env add DATABASE_URL production`, `npx vercel env add API_KEY production`,
   then `npx vercel --prod`.
4. Run the check against the production API base (`https://<host>/api`), then call `POST /api/reset` with the slots you want to leave in place.

After a schema change, run `npm run db:generate` to write a new migration to `src/db/migrations/`,
then `npm run db:migrate`.
