-- Allow video/mp4 and video/webm in hotel-assets bucket (fix "mime type video/mp4 is not supported")
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'video/mp4',
  'video/webm'
]
WHERE id = 'hotel-assets';
