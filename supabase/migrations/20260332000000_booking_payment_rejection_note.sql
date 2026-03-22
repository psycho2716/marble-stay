-- Note from hotel when rejecting a payment receipt (guest may re-upload).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_rejection_note TEXT;

COMMENT ON COLUMN public.bookings.payment_rejection_note IS 'Hotel message when rejecting uploaded payment proof; guest can upload a new receipt.';
