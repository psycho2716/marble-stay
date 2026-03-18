-- Ensure room columns exist (fix "bathroom_count not in schema cache" when migrations were not applied)
-- Run this in Supabase SQL Editor if you see that error, or run: supabase db push

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS offer_hourly BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS bathroom_count SMALLINT,
  ADD COLUMN IF NOT EXISTS bathroom_shared BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.rooms.description IS 'Room description for guests.';
COMMENT ON COLUMN public.rooms.offer_hourly IS 'If true, room supports micro-stay hourly booking.';
COMMENT ON COLUMN public.rooms.media IS 'Array of { type: "image"|"video", path: string }.';
COMMENT ON COLUMN public.rooms.bathroom_count IS 'Number of bathrooms in the room.';
COMMENT ON COLUMN public.rooms.bathroom_shared IS 'True = shared bathroom, false = private.';
COMMENT ON COLUMN public.rooms.is_available IS 'If false, room is disabled/unbookable (hotel-controlled).';
