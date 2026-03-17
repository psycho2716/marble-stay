-- ============================================================
-- Room: description, offer_hourly, media (images + video), bathroom_count
-- media: JSONB array of { "type": "image"|"video", "path": "..." }, max 10, max 1 video
-- ============================================================

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS offer_hourly BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS bathroom_count SMALLINT;

COMMENT ON COLUMN public.rooms.description IS 'Room description for guests.';
COMMENT ON COLUMN public.rooms.offer_hourly IS 'If true, room supports micro-stay hourly booking; hourly_rate is used.';
COMMENT ON COLUMN public.rooms.media IS 'Array of { type: "image"|"video", path: string }; max 10 items, max 1 video.';
COMMENT ON COLUMN public.rooms.bathroom_count IS 'Number of bathrooms in the room.';

-- Allow video in hotel-assets bucket for room media
UPDATE storage.buckets
SET allowed_mime_types = array_cat(COALESCE(allowed_mime_types, ARRAY[]::text[]), ARRAY['video/mp4', 'video/webm'])
WHERE id = 'hotel-assets'
  AND NOT (allowed_mime_types @> ARRAY['video/mp4']);
