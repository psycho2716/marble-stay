-- ============================================================
-- Create default admin user and set role to admin
--
-- Default credentials (change password after first login):
--   Email:    admin@marblestay.local
--   Password: AdminChangeMe123!
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_email TEXT := 'admin@marblestay.local';
  -- Explicit cast + schema qualification avoids "function gen_salt(...) does not exist"
  -- on some Supabase/Postgres deployments where extension functions live under `extensions`.
  v_encrypted_pw TEXT := extensions.crypt('admin1234'::text, extensions.gen_salt('bf'::text));
BEGIN
  -- Insert into auth.users so Supabase Auth recognizes the user
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
    jsonb_build_object('full_name', 'Admin'),
    NOW(),
    NOW()
  );

  -- Required for email sign-in: link identity (provider_id must be user id for email provider)
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

  -- App role (guest | hotel | admin) lives in public.profiles.
  -- Trigger on auth.users created a profile with role 'guest'; set it to admin.
  UPDATE public.profiles
  SET role = 'admin'
  WHERE id = v_user_id;
END
$$;