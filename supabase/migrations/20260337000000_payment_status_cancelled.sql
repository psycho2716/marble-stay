-- When a booking is cancelled, payment should not remain "pending".
DO $migration$
DECLARE
  v_has_cancelled boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'payment_status'
      AND e.enumlabel = 'cancelled'
  ) INTO v_has_cancelled;

  -- Postgres considers it unsafe to immediately use a newly-added enum value
  -- in the same transaction. So: if the value is missing, add it and skip
  -- the UPDATE here; a subsequent `db push` will then apply the UPDATE.
  IF NOT v_has_cancelled THEN
    ALTER TYPE public.payment_status ADD VALUE 'cancelled';
  ELSE
    UPDATE public.bookings
    SET payment_status = 'cancelled'::public.payment_status
    WHERE status = 'cancelled'::public.booking_status
      AND payment_status = 'pending'::public.payment_status;
  END IF;
END;
$migration$;
