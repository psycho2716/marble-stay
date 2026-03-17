-- ============================================================
-- Hotel profile: cover image, profile image, bio, opening hours,
-- check-in and check-out times (FB-style profile)
-- ============================================================

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS profile_image TEXT,
  ADD COLUMN IF NOT EXISTS cover_image TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS opening_hours JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS check_in_time TIME,
  ADD COLUMN IF NOT EXISTS check_out_time TIME;

COMMENT ON COLUMN public.hotels.profile_image IS 'Storage path for hotel profile/avatar image (hotel-assets bucket).';
COMMENT ON COLUMN public.hotels.cover_image IS 'Storage path for hotel cover/background image (hotel-assets bucket).';
COMMENT ON COLUMN public.hotels.bio IS 'Hotel bio / about text for profile page.';
COMMENT ON COLUMN public.hotels.opening_hours IS 'Opening hours per day, e.g. {"monday":{"open":"09:00","close":"18:00"},"tuesday":...}.';
COMMENT ON COLUMN public.hotels.check_in_time IS 'Default check-in time (e.g. 14:00).';
COMMENT ON COLUMN public.hotels.check_out_time IS 'Default check-out time (e.g. 11:00).';
