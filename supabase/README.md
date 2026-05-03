# Supabase — Database & File Storage

This folder contains the **database schema and migrations** for the Centralized Romblon Hotel Booking System. Supabase provides **PostgreSQL**, **Auth**, **Realtime**, and **Storage**.

## Separation of concerns

- **Frontend** (`/frontend`): Next.js app — UI only; calls the backend API.
- **Backend** (`/backend`): Express.js server — all server logic and API; talks to Supabase (DB + Storage).
- **Supabase**: Database (PostgreSQL) and file storage. No business logic here; only schema, RLS, and storage buckets.

## Migrations (order matters)

Run in order (Supabase CLI applies them by timestamp):

| Migration | Purpose |
|-----------|---------|
| `20260313100000_initial_schema.sql` | Extensions, enums, tables (hotels, profiles, rooms, availability, bookings, reviews, user_preferences), indexes, `updated_at` triggers |
| `20260313100001_rls_policies.sql` | Row Level Security on all tables; role-based policies (guest, hotel, admin) |
| `20260313100002_auth_trigger.sql` | Auto-create guest profile on auth signup |
| `20260313100003_storage.sql` | Bucket `hotel-assets` (images + business permit PDF/image); storage policies |

## Database seed (`seed.sql`)

After migrations, `supabase db reset` runs **`seed.sql`** (see `config.toml` → `[db.seed]`).

- **Admin user (idempotent):** if `admin@marblestay.local` is not in `auth.users`, the seed creates it with password `AdminChangeMe123!`, email confirmed, `profiles.role = admin`, and `guest_onboarding_completed = true`.
- If that user already exists (for example from migration `20260316100000_create_admin_user.sql`), the seed logs a notice and does nothing.
- **Demo showcase users** (hotels + guests, shared password `demo_user1234`): see [DEMO-SEED-LOGINS.md](./DEMO-SEED-LOGINS.md).

For **hosted** Supabase (or without resetting the DB), use the backend script instead:

```bash
cd backend
# Ensure SUPABASE_URL + SUPABASE_SERVICE_KEY in .env
npm run seed:admin
```

Optional env: `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`.

## Applying migrations

With [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Or run the SQL files manually in the Supabase Dashboard → SQL Editor, in the order above.

## Storage layout

- **Bucket:** `hotel-assets`
  - **Path pattern:** `{hotel_id}/{filename}` (e.g. `uuid/main.jpg`, `uuid/permit.pdf`)
  - **Allowed:** images (JPEG, PNG, WebP, GIF), PDF. Max 10MB per file.
  - **Use:** Hotel/room images and business permit uploads. Public read for listing; business permit access restricted in app/backend.

## Roles (RLS)

- **guest:** Own bookings, preferences; read verified hotels/rooms.
- **hotel:** Read/update own hotel and its rooms, availability, bookings; upload to own folder in `hotel-assets`.
- **admin:** Full read/write; verify/reject hotels; view business permits.
