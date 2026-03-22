-- When a booking is cancelled, payment should not remain "pending".
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'payment_status'
      AND e.enumlabel = 'cancelled'
  ) THEN
    ALTER TYPE public.payment_status ADD VALUE 'cancelled';
  END IF;
END;
$migration$;

UPDATE public.bookings
SET payment_status = 'cancelled'::public.payment_status
WHERE status = 'cancelled'::public.booking_status
  AND payment_status = 'pending'::public.payment_status;
