-- ============================================================
-- Permit expiration: admin can set when the hotel's legal document
-- expires. When past this date, hotel must re-submit for compliance.
-- ============================================================

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS permit_expires_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.hotels.permit_expires_at IS 'When the submitted business permit expires. After this date the hotel is treated as unverified until they re-submit. Set by admin on verify.';
