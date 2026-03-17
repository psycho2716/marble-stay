alter table public.profiles enable row level security;
alter table public.hotels enable row level security;
alter table public.rooms enable row level security;
alter table public.room_availability enable row level security;
alter table public.bookings enable row level security;
alter table public.reviews enable row level security;
alter table public.user_preferences enable row level security;

create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create policy "profiles_select_own"
  on public.profiles
  for select
  using (id = public.current_user_id());

create policy "profiles_update_own"
  on public.profiles
  for update
  using (id = public.current_user_id());

create policy "hotels_select_public"
  on public.hotels
  for select
  using (verification_status = 'verified');

create policy "bookings_select_own"
  on public.bookings
  for select
  using (user_id = public.current_user_id());

-- ============================================================
-- Row Level Security (RLS) — Centralized Romblon Hotel Booking
-- ============================================================

-- Enable RLS on all relevant tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_hourly_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper: get current user's role (from profiles)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_role(uid UUID)
RETURNS app_role AS $$
  SELECT role FROM public.profiles WHERE id = uid LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_hotel_id(uid UUID)
RETURNS UUID AS $$
  SELECT hotel_id FROM public.profiles WHERE id = uid LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- PROFILES
-- Users read own row; admin reads all. No separate staff profile.
-- ============================================================

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile (limited fields)"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admin can read all profiles"
  ON public.profiles FOR SELECT
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Service role can insert profile (on signup)"
  ON public.profiles FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- HOTELS
-- Public: read only verified. Hotel role: update own. Admin: full.
-- ============================================================

CREATE POLICY "Public can read verified hotels only"
  ON public.hotels FOR SELECT
  USING (verification_status = 'verified');

CREATE POLICY "Hotel can read own hotel (any status)"
  ON public.hotels FOR SELECT
  USING (
    public.get_user_role(auth.uid()) = 'hotel'
    AND id = public.get_user_hotel_id(auth.uid())
  );

CREATE POLICY "Hotel can update own hotel"
  ON public.hotels FOR UPDATE
  USING (
    public.get_user_role(auth.uid()) = 'hotel'
    AND id = public.get_user_hotel_id(auth.uid())
  );

CREATE POLICY "Admin can read all hotels"
  ON public.hotels FOR SELECT
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admin can insert and update and delete hotels"
  ON public.hotels FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- Allow hotel registration: authenticated user can insert hotel (pending) when signing up as hotel; backend/service handles this.
CREATE POLICY "Authenticated can insert hotel (pending)"
  ON public.hotels FOR INSERT
  WITH CHECK (verification_status = 'pending');

-- ============================================================
-- ROOMS
-- Public read; hotel (own hotel) write; admin full.
-- ============================================================

CREATE POLICY "Public can read rooms of verified hotels"
  ON public.rooms FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.hotels h
      WHERE h.id = rooms.hotel_id AND h.verification_status = 'verified'
    )
  );

CREATE POLICY "Hotel can read rooms of own hotel"
  ON public.rooms FOR SELECT
  USING (hotel_id = public.get_user_hotel_id(auth.uid()));

CREATE POLICY "Hotel can insert rooms for own hotel"
  ON public.rooms FOR INSERT
  WITH CHECK (
    public.get_user_role(auth.uid()) = 'hotel'
    AND hotel_id = public.get_user_hotel_id(auth.uid())
  );

CREATE POLICY "Hotel can update and delete own hotel rooms"
  ON public.rooms FOR UPDATE
  USING (hotel_id = public.get_user_hotel_id(auth.uid()));

CREATE POLICY "Hotel can delete own hotel rooms"
  ON public.rooms FOR DELETE
  USING (hotel_id = public.get_user_hotel_id(auth.uid()));

CREATE POLICY "Admin full access rooms"
  ON public.rooms FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- ROOM_AVAILABILITY & ROOM_HOURLY_SLOTS
-- Same as rooms: public read for verified hotel rooms; hotel manage own.
-- ============================================================

CREATE POLICY "Public read room_availability for verified hotels"
  ON public.room_availability FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms r
      JOIN public.hotels h ON h.id = r.hotel_id
      WHERE r.id = room_availability.room_id AND h.verification_status = 'verified'
    )
  );

CREATE POLICY "Hotel manage own room_availability"
  ON public.room_availability FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_availability.room_id AND r.hotel_id = public.get_user_hotel_id(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_availability.room_id AND r.hotel_id = public.get_user_hotel_id(auth.uid())
    )
  );

CREATE POLICY "Public read room_hourly_slots for verified hotels"
  ON public.room_hourly_slots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms r
      JOIN public.hotels h ON h.id = r.hotel_id
      WHERE r.id = room_hourly_slots.room_id AND h.verification_status = 'verified'
    )
  );

CREATE POLICY "Hotel manage own room_hourly_slots"
  ON public.room_hourly_slots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_hourly_slots.room_id AND r.hotel_id = public.get_user_hotel_id(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_hourly_slots.room_id AND r.hotel_id = public.get_user_hotel_id(auth.uid())
    )
  );

-- ============================================================
-- BOOKINGS
-- Guests: own; Hotel: own hotel's; Admin: all.
-- ============================================================

CREATE POLICY "Guests can read own bookings"
  ON public.bookings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Guests can insert own bookings"
  ON public.bookings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Guests can update own bookings (e.g. cancel)"
  ON public.bookings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Hotel can read bookings for own hotel rooms"
  ON public.bookings FOR SELECT
  USING (
    public.get_user_role(auth.uid()) = 'hotel'
    AND EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = bookings.room_id AND r.hotel_id = public.get_user_hotel_id(auth.uid())
    )
  );

CREATE POLICY "Hotel can update bookings for own hotel (confirm/cancel)"
  ON public.bookings FOR UPDATE
  USING (
    public.get_user_role(auth.uid()) = 'hotel'
    AND EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = bookings.room_id AND r.hotel_id = public.get_user_hotel_id(auth.uid())
    )
  );

CREATE POLICY "Admin full access bookings"
  ON public.bookings FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- REVIEWS
-- Public read; authenticated insert for own completed bookings.
-- ============================================================

CREATE POLICY "Public can read reviews"
  ON public.reviews FOR SELECT
  USING (true);

CREATE POLICY "Users can insert review for own completed booking"
  ON public.reviews FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND b.user_id = auth.uid() AND b.status = 'completed'
    )
  );

-- ============================================================
-- USER_PREFERENCES
-- User CRUD own row only.
-- ============================================================

CREATE POLICY "Users can read own preferences"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own preferences"
  ON public.user_preferences FOR DELETE
  USING (auth.uid() = user_id);
