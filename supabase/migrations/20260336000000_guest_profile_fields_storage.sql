-- Guest profile: optional contact fields + avatar (storage path in guest-assets)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS avatar_path TEXT;

COMMENT ON COLUMN public.profiles.phone IS 'Guest phone (optional).';
COMMENT ON COLUMN public.profiles.country IS 'Guest country/region (optional).';
COMMENT ON COLUMN public.profiles.avatar_path IS 'Object path in guest-assets bucket for profile photo.';

-- Public bucket for guest avatars (backend uploads via service role; 2MB cap per UI)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'guest-assets',
  'guest-assets',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read guest-assets" ON storage.objects;

CREATE POLICY "Public read guest-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'guest-assets');
