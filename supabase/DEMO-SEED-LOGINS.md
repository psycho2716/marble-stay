# Demo seed accounts (`seed.sql`)

These users are created by the **demo showcase** block in [`seed.sql`](./seed.sql) (after the admin user section). They are intended for **local development** after `supabase db reset` (or an equivalent run of `seed.sql`).

## Security

- Treat `demo_user1234` as **non-secret dev-only** credentials.
- Do **not** use these passwords in production.
- The seed is **idempotent**: if `demo-guest-onboarding@marblestay.local` already exists, the demo block skips creating the showcase data.

## Shared password

All demo accounts below use the same password:

**`demo_user1234`**

## Accounts

| Email | Role / persona | What it’s for |
|--------|----------------|---------------|
| `demo-hotel-verified@marblestay.local` | Verified hotel owner | Hotel is verified for search and bookings. |
| `demo-hotel-pending@marblestay.local` | Pending hotel owner | Hotel is still pending verification. |
| `demo-guest-onboarding@marblestay.local` | Guest | `guest_onboarding_completed = false` — exercise onboarding and preferences flows. |
| `demo-guest-bookings@marblestay.local` | Guest | Onboarding completed, has `user_preferences`, plus mixed bookings (e.g. pending, confirmed, completed) and sample review/message data. |

## Admin user (separate)

The **admin** account is created by the first block in `seed.sql` and is **not** part of the shared `demo_user1234` set. See [Supabase README — Database seed](./README.md#database-seed-seedsql) for admin email and password notes.

## Applying the seed

From the repo root, with the Supabase CLI:

```bash
supabase db reset
```

This runs migrations, then `seed.sql` (see `config.toml` → `[db.seed]`).
