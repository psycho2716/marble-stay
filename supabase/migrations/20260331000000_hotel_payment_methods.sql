-- ============================================================
-- Multiple payment methods per hotel (QR providers)
-- Guests can choose which provider to use when paying online
-- ============================================================

CREATE TABLE public.hotel_payment_methods (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  qr_image_path TEXT,
  account_name TEXT,
  account_number TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hotel_payment_methods_hotel_id ON public.hotel_payment_methods(hotel_id);

COMMENT ON TABLE public.hotel_payment_methods IS 'Multiple payment QR providers per hotel; guests choose one when paying online.';
COMMENT ON COLUMN public.hotel_payment_methods.label IS 'Display name (e.g. GCash, PayMaya, Bank Transfer).';
COMMENT ON COLUMN public.hotel_payment_methods.qr_image_path IS 'Storage path in hotel-assets bucket for QR code image.';
