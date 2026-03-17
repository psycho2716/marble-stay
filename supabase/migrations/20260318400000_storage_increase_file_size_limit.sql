-- Increase hotel-assets file size limit for room videos (fix "object exceeded maximum allowed size")
-- 10MB is too small for typical short videos; allow up to 100MB per file
UPDATE storage.buckets
SET file_size_limit = 104857600  -- 100MB
WHERE id = 'hotel-assets';
