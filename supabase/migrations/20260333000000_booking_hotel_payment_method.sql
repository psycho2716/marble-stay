-- Which hotel-configured online provider the guest selected (if any).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS hotel_payment_method_id UUID NULL
  REFERENCES public.hotel_payment_methods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_hotel_payment_method_id
  ON public.bookings(hotel_payment_method_id);

COMMENT ON COLUMN public.bookings.hotel_payment_method_id IS 'FK to hotel_payment_methods when guest paid online via a configured provider; null for cash or legacy single QR.';
