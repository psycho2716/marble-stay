-- Guest profile: mailing address + demographics (optional; helps hotels / support)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address_line TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

COMMENT ON COLUMN public.profiles.address_line IS 'Guest street address (optional).';
COMMENT ON COLUMN public.profiles.city IS 'Guest city (optional).';
COMMENT ON COLUMN public.profiles.region IS 'Guest province / state / region (optional).';
COMMENT ON COLUMN public.profiles.postal_code IS 'Guest postal or ZIP code (optional).';
COMMENT ON COLUMN public.profiles.gender IS 'Guest gender (optional); constrained to known values.';
COMMENT ON COLUMN public.profiles.date_of_birth IS 'Guest date of birth (optional).';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_gender_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_gender_check CHECK (
    gender IS NULL
    OR gender IN ('prefer_not_to_say', 'male', 'female', 'non_binary', 'other')
  );
