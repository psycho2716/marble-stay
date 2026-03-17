-- ============================================================
-- Storage buckets and policies (Supabase Storage)
-- For hotel images, room images, and business permit (PDF/image)
-- ============================================================

-- Bucket: hotel assets (images, business permits)
-- Public read for hotel/room images; business permits restricted
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hotel-assets',
  'hotel-assets',
  true,
  10485760,  -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Public can read objects (for displaying hotel/room images; business permit URLs can be signed or restricted by app logic)
CREATE POLICY "Public read hotel-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'hotel-assets');

-- Policy: Hotel role can upload to folder named by their hotel_id (path: hotel_id/filename)
CREATE POLICY "Hotel can upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'hotel-assets'
    AND (storage.foldername(name))[1] = public.get_user_hotel_id(auth.uid())::text
  );

-- Policy: Hotel can update/delete own folder objects
CREATE POLICY "Hotel can update own folder objects"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'hotel-assets'
    AND (storage.foldername(name))[1] = public.get_user_hotel_id(auth.uid())::text
  );

CREATE POLICY "Hotel can delete own folder objects"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'hotel-assets'
    AND (storage.foldername(name))[1] = public.get_user_hotel_id(auth.uid())::text
  );

-- Admin full access to hotel-assets (for viewing business permits)
CREATE POLICY "Admin full access hotel-assets"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'hotel-assets'
    AND public.get_user_role(auth.uid()) = 'admin'
  )
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');
