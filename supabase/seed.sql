-- =============================================================================
-- Marble Stay — database seed (runs after migrations on `supabase db reset`)
-- =============================================================================
-- Idempotent admin user for local development. Skips if the email already
-- exists (e.g. already created by migration 20260316100000_create_admin_user.sql).
--
-- Default login (change after first use):
--   Email:    admin@marblestay.local
--   Password: AdminChangeMe123!
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_email TEXT := 'admin@marblestay.local';
  v_password TEXT := 'admin1234';
  v_user_id UUID := gen_random_uuid();
  v_encrypted_pw TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    RAISE NOTICE 'Seed: admin user % already exists; skipping insert.', v_email;
    RETURN;
  END IF;

  v_encrypted_pw := crypt(v_password, gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    v_encrypted_pw,
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', 'System Admin', 'role', 'admin'),
    NOW(),
    NOW()
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    v_user_id,
    format('{"sub":"%s","email":"%s"}', v_user_id, v_email)::jsonb,
    'email',
    v_user_id::text,
    NOW(),
    NOW(),
    NOW()
  );

  UPDATE public.profiles
  SET
    role = 'admin',
    full_name = COALESCE(NULLIF(trim(full_name), ''), 'System Admin'),
    guest_onboarding_completed = true
  WHERE id = v_user_id;

  RAISE NOTICE 'Seed: created admin user % (id %).', v_email, v_user_id;
END
$$;