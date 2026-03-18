-- ============================================================
-- Hotel payment method: QR code image, account name, account number
-- For online payment option when guests book (scan QR to pay)
-- ============================================================

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS payment_qr_image TEXT,
  ADD COLUMN IF NOT EXISTS payment_account_name TEXT,
  ADD COLUMN IF NOT EXISTS payment_account_number TEXT;

COMMENT ON COLUMN public.hotels.payment_qr_image IS 'Storage path for payment QR code image (hotel-assets bucket). Shown to guests when they choose online payment.';
COMMENT ON COLUMN public.hotels.payment_account_name IS 'Account name for the QR payment (e.g. business or bank account name).';
COMMENT ON COLUMN public.hotels.payment_account_number IS 'Account number for the QR payment (e.g. mobile number or account number).';
