-- Room-level configuration: which hours (0-23) are available for hourly booking.
-- When room_hourly_slots has no rows for a date, guest API can use this as the default.
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS hourly_available_hours integer[] DEFAULT NULL;

COMMENT ON COLUMN public.rooms.hourly_available_hours IS 'Hours of the day (0-23) available for hourly booking; used when no room_hourly_slots exist for a date.';
