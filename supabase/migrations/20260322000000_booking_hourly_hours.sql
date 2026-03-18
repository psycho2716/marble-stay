-- Store which hours were booked for hourly bookings (so we can exclude them from availability).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS hourly_hours integer[] DEFAULT NULL;

COMMENT ON COLUMN public.bookings.hourly_hours IS 'For booking_type=hourly: array of hour numbers (0-23) that were booked.';
