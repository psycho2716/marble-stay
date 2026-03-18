-- Hotel currency: what currency the hotel uses for rates (default PHP).
ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'PHP';

COMMENT ON COLUMN public.hotels.currency IS 'ISO 4217 code (e.g. PHP, USD, EUR). Used for displaying prices to guests.';
