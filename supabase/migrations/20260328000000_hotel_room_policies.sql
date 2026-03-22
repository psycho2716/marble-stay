-- Hotel-defined room policy text (system-defined keys, hotel-provided content).
-- Shown on room view only when the hotel has set a value.

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS pets_policy TEXT,
  ADD COLUMN IF NOT EXISTS smoking_policy TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT;

COMMENT ON COLUMN public.hotels.pets_policy IS 'Hotel-provided text for the Pets policy (e.g. "Small pets allowed"). Shown on room page only if set.';
COMMENT ON COLUMN public.hotels.smoking_policy IS 'Hotel-provided text for the Smoking policy (e.g. "100% Smoke-free facility"). Shown on room page only if set.';
COMMENT ON COLUMN public.hotels.cancellation_policy IS 'Hotel-provided text for the Cancellation policy (e.g. "Free cancellation up to 48 hours before arrival"). Shown on room page only if set.';
