-- ============================================================
-- Fix "Database error querying schema" on login
-- GoTrue fails when token columns in auth.users are NULL.
-- Set them to empty string for any existing rows.
-- ============================================================

UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, '')
WHERE
  confirmation_token IS NULL
  OR recovery_token IS NULL
  OR email_change_token_new IS NULL
  OR email_change IS NULL;
