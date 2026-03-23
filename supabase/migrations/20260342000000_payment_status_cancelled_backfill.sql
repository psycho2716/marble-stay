-- Backfill payment_status for cancelled bookings
-- (the payment_status enum value is added in a prior migration)

UPDATE public.bookings
SET payment_status = 'cancelled'::public.payment_status
WHERE status = 'cancelled'::public.booking_status
  AND payment_status = 'pending'::public.payment_status;

