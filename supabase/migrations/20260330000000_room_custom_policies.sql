-- Custom policies (hotel/room-defined) with system-controlled icon set.
-- Stored per-room as JSONB. Only visible on room view when both label and value exist.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS custom_policies JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.rooms.custom_policies IS
  'Per-room custom policies array: [{ iconKey: string, label: string, value: string }].';

