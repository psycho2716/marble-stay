UPDATE auth.identities
SET provider_id = user_id::text
WHERE provider = 'email'
  AND user_id = (SELECT id FROM auth.users WHERE email = 'admin@marblestay.local');