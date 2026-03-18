-- Reason provided by hotel when declining a booking
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS decline_reason TEXT DEFAULT NULL;

COMMENT ON COLUMN public.bookings.decline_reason IS 'Reason given by the hotel when declining the booking.';
