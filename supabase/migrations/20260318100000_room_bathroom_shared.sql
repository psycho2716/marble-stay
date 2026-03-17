-- ============================================================
-- Room: bathroom_shared — whether bathroom is shared or private
-- ============================================================

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS bathroom_shared BOOLEAN;

COMMENT ON COLUMN public.rooms.bathroom_shared IS 'True = shared bathroom, false = private. Null = not specified.';
