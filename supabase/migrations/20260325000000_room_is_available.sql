-- Add a global availability toggle per room.
-- When false, guests cannot book the room and it should be hidden from public listings.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.rooms.is_available IS 'If false, room is disabled/unbookable (hotel-controlled).';

