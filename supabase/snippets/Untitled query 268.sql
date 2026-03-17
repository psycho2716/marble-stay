UPDATE storage.buckets
SET file_size_limit = 104857600  -- 100MB
WHERE id = 'hotel-assets';