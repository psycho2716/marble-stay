-- Room-level: featured flag and policy text (overrides hotel default when set).
-- Policies shown on room view only when they have values (room or hotel).

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pets_policy TEXT,
  ADD COLUMN IF NOT EXISTS smoking_policy TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT;

COMMENT ON COLUMN public.rooms.featured IS 'Hotel can mark specific rooms as featured; shown on room and listing.';
COMMENT ON COLUMN public.rooms.pets_policy IS 'Room-specific pets policy text. If set, overrides hotel default on room view.';
COMMENT ON COLUMN public.rooms.smoking_policy IS 'Room-specific smoking policy text. If set, overrides hotel default on room view.';
COMMENT ON COLUMN public.rooms.cancellation_policy IS 'Room-specific cancellation policy text. If set, overrides hotel default on room view.';
