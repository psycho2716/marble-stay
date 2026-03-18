-- Add payment method and receipt path to bookings (for online payment receipt upload)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_receipt_path TEXT;

COMMENT ON COLUMN public.bookings.payment_method IS 'cash or online';
COMMENT ON COLUMN public.bookings.payment_receipt_path IS 'Storage path for uploaded payment receipt image (when payment_method = online)';
