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

  v_encrypted_pw := extensions.crypt(v_password::text, extensions.gen_salt('bf'::text));

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

-- =============================================================================
-- Demo showcase (hotels + guests) — idempotent; skips if marker guest exists
-- =============================================================================
-- Demo images use Lorem Flickr with fixed tags + ?lock= so each property stays on-theme:
--   Verified resort + its rooms: hotel,luxury,bedroom (one visual family).
--   Pending lodge + garden room: boutique,hotel,interior / hotel,room,garden.
-- The API treats http(s) URLs as ready-to-display; storage paths still use signed URLs.
--
-- Intended for local `supabase db reset` and manual SQL runs. Uses the same
-- auth.users shape as the admin seed above.
--
-- Password for ALL demo accounts below: demo_user1234
--
-- Hotel owners (log in as hotel; profile links to hotel_id):
--   demo-hotel-verified@marblestay.local   — hotel verified for search/bookings
--   demo-hotel-pending@marblestay.local    — hotel still pending verification
--
-- Guests:
--   demo-guest-onboarding@marblestay.local — guest_onboarding_completed = false
--                                            (app shows /onboarding + prefs UI)
--   demo-guest-bookings@marblestay.local    — onboarding done + user_preferences;
--                                            bookings: pending, confirmed (active),
--                                            completed (+ sample review + message)
-- =============================================================================

DO $$
DECLARE
  v_encrypted_pw TEXT := extensions.crypt('demo_user1234'::text, extensions.gen_salt('bf'::text));

  v_hotel_verified CONSTANT uuid := 'a0000001-0000-4000-8000-000000000001';
  v_hotel_pending CONSTANT uuid := 'a0000001-0000-4000-8000-000000000002';

  v_owner_verified CONSTANT uuid := 'b0000001-0000-4000-8000-000000000001';
  v_owner_pending CONSTANT uuid := 'b0000001-0000-4000-8000-000000000002';
  v_guest_onboarding CONSTANT uuid := 'b0000001-0000-4000-8000-000000000003';
  v_guest_bookings CONSTANT uuid := 'b0000001-0000-4000-8000-000000000004';

  v_room_verified_deluxe CONSTANT uuid := 'c0000001-0000-4000-8000-000000000001';
  v_room_verified_standard CONSTANT uuid := 'c0000001-0000-4000-8000-000000000002';
  v_room_pending_only CONSTANT uuid := 'c0000001-0000-4000-8000-000000000003';

  v_pay_gcash CONSTANT uuid := 'd0000001-0000-4000-8000-000000000001';

  v_book_pending CONSTANT uuid := 'e0000001-0000-4000-8000-000000000001';
  v_book_active CONSTANT uuid := 'e0000001-0000-4000-8000-000000000002';
  v_book_completed CONSTANT uuid := 'e0000001-0000-4000-8000-000000000003';

  r RECORD;

  -- Thematic URLs: same comma-tags + different ?lock= → coherent stock within each hotel story.
  v_verified_gallery text[] := ARRAY[
    'https://loremflickr.com/1600/1067/hotel,luxury,bedroom?lock=88001',
    'https://loremflickr.com/1600/1067/hotel,luxury,bedroom?lock=88002',
    'https://loremflickr.com/1600/1067/hotel,luxury,bedroom?lock=88003',
    'https://loremflickr.com/1600/1067/hotel,luxury,bedroom?lock=88004',
    'https://loremflickr.com/1600/1067/hotel,luxury,bedroom?lock=88005'
  ];
  v_verified_profile text := 'https://loremflickr.com/800/800/hotel,luxury,bedroom?lock=88006';
  v_verified_cover text := 'https://loremflickr.com/1920/1080/hotel,luxury,bedroom?lock=88007';

  v_pending_gallery text[] := ARRAY[
    'https://loremflickr.com/1600/1067/boutique,hotel,interior?lock=88101',
    'https://loremflickr.com/1600/1067/boutique,hotel,interior?lock=88102',
    'https://loremflickr.com/1600/1067/boutique,hotel,interior?lock=88103',
    'https://loremflickr.com/1600/1067/boutique,hotel,interior?lock=88104',
    'https://loremflickr.com/1600/1067/boutique,hotel,interior?lock=88105'
  ];
  v_pending_profile text := 'https://loremflickr.com/800/800/boutique,hotel,interior?lock=88106';
  v_pending_cover text := 'https://loremflickr.com/1920/1080/boutique,hotel,interior?lock=88107';

  -- Same luxury tag set as verified hotel (deluxe + standard are both rooms at that resort).
  v_media_deluxe jsonb := jsonb_build_array(
    jsonb_build_object('type', 'image', 'path', 'https://loremflickr.com/1200/800/hotel,luxury,bedroom?lock=88008'),
    jsonb_build_object('type', 'image', 'path', 'https://loremflickr.com/1200/800/hotel,luxury,bedroom?lock=88009'),
    jsonb_build_object('type', 'image', 'path', 'https://loremflickr.com/1200/800/hotel,luxury,bedroom?lock=88010'),
    jsonb_build_object('type', 'image', 'path', 'https://loremflickr.com/1200/800/hotel,luxury,bedroom?lock=88011')
  );
  v_media_standard jsonb := jsonb_build_array(
    jsonb_build_object('type', 'image', 'path', 'https://loremflickr.com/1200/800/hotel,luxury,bedroom?lock=88012'),
    jsonb_build_object('type', 'image', 'path', 'https://loremflickr.com/1200/800/hotel,luxury,bedroom?lock=88013'),
    jsonb_build_object('type', 'image', 'path', 'https://loremflickr.com/1200/800/hotel,luxury,bedroom?lock=88014'),
    jsonb_build_object('type', 'image', 'path', 'https://loremflickr.com/1200/800/hotel,luxury,bedroom?lock=88015')
  );
  -- Garden room at pending lodge: greenery + hotel room (still lodging, not unrelated nature shots).
  v_media_garden jsonb := jsonb_build_array(
    jsonb_build_object('type', 'image', 'path', 'https://loremflickr.com/1200/800/hotel,room,garden?lock=88201'),
    jsonb_build_object('type', 'image', 'path', 'https://loremflickr.com/1200/800/hotel,room,garden?lock=88202'),
    jsonb_build_object('type', 'image', 'path', 'https://loremflickr.com/1200/800/hotel,room,garden?lock=88203'),
    jsonb_build_object('type', 'image', 'path', 'https://loremflickr.com/1200/800/hotel,room,garden?lock=88204')
  );
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'demo-guest-onboarding@marblestay.local') THEN
    RAISE NOTICE 'Seed: demo showcase users already exist; skipping.';
    RETURN;
  END IF;

  INSERT INTO public.hotels (
    id,
    name,
    description,
    address,
    latitude,
    longitude,
    contact_email,
    contact_phone,
    images,
    profile_image,
    cover_image,
    verification_status,
    currency,
    permit_expires_at,
    bio,
    check_in_time,
    check_out_time,
    opening_hours
  )
  VALUES
    (
      v_hotel_verified,
      'Marble Demo — Verified Resort',
      'Showcase property: verified, searchable, and ready for bookings.',
      'Romblon Town Proper, Romblon, Philippines',
      12.5777,
      122.2691,
      'frontdesk@verified-demo.marblestay.local',
      '+63 900 111 0001',
      v_verified_gallery,
      v_verified_profile,
      v_verified_cover,
      'verified',
      'PHP',
      (NOW() + INTERVAL '365 days'),
      'Family-friendly resort near the port — demo data for Marble Stay.',
      '14:00'::time,
      '11:00'::time,
      '{"monday":{"open":"06:00","close":"22:00"},"tuesday":{"open":"06:00","close":"22:00"}}'::jsonb
    ),
    (
      v_hotel_pending,
      'Marble Demo — Pending Lodge',
      'Second showcase hotel: still awaiting admin verification.',
      'Lonos, Romblon, Philippines',
      12.585,
      122.275,
      'info@pending-demo.marblestay.local',
      '+63 900 222 0002',
      v_pending_gallery,
      v_pending_profile,
      v_pending_cover,
      'pending',
      'PHP',
      NULL,
      'Boutique lodge — demo row with verification_status = pending.',
      '15:00'::time,
      '10:00'::time,
      '{}'::jsonb
    );

  FOR r IN
    SELECT * FROM (
      VALUES
        (v_owner_verified, 'demo-hotel-verified@marblestay.local'::text, 'Demo Verified Owner'::text, 'hotel'::text),
        (v_owner_pending, 'demo-hotel-pending@marblestay.local'::text, 'Demo Pending Owner'::text, 'hotel'::text),
        (v_guest_onboarding, 'demo-guest-onboarding@marblestay.local'::text, 'Demo Guest (Onboarding)'::text, 'guest'::text),
        (v_guest_bookings, 'demo-guest-bookings@marblestay.local'::text, 'Demo Guest (Bookings)'::text, 'guest'::text)
    ) AS t(uid, em, fn, rl)
  LOOP
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
      r.uid,
      'authenticated',
      'authenticated',
      r.em,
      v_encrypted_pw,
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', r.fn, 'role', r.rl),
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
      r.uid,
      r.uid,
      format('{"sub":"%s","email":"%s"}', r.uid, r.em)::jsonb,
      'email',
      r.uid::text,
      NOW(),
      NOW(),
      NOW()
    );
  END LOOP;

  UPDATE public.profiles
  SET
    role = 'hotel',
    hotel_id = v_hotel_verified,
    full_name = 'Demo Verified Owner',
    guest_onboarding_completed = true
  WHERE id = v_owner_verified;

  UPDATE public.profiles
  SET
    role = 'hotel',
    hotel_id = v_hotel_pending,
    full_name = 'Demo Pending Owner',
    guest_onboarding_completed = true
  WHERE id = v_owner_pending;

  UPDATE public.profiles
  SET
    full_name = 'Demo Guest (Onboarding)',
    guest_onboarding_completed = false
  WHERE id = v_guest_onboarding;

  UPDATE public.profiles
  SET
    full_name = 'Demo Guest (Bookings)',
    guest_onboarding_completed = true,
    country = 'PH',
    phone = '+63 900 333 0003'
  WHERE id = v_guest_bookings;

  INSERT INTO public.rooms (
    id,
    hotel_id,
    name,
    room_type,
    base_price_night,
    hourly_rate,
    capacity,
    amenities,
    description,
    media,
    offer_hourly,
    is_available
  )
  VALUES
    (
      v_room_verified_deluxe,
      v_hotel_verified,
      'Deluxe Sea View',
      'deluxe',
      4500.00,
      NULL,
      2,
      '["wifi","tv","minibar","sea_view"]'::jsonb,
      'Corner room with balcony — demo nightly listing.',
      v_media_deluxe,
      false,
      true
    ),
    (
      v_room_verified_standard,
      v_hotel_verified,
      'Standard Twin',
      'standard',
      2800.00,
      350.00,
      2,
      '["wifi","tv"]'::jsonb,
      'Comfortable twin; hourly rate enabled for micro-stay demos.',
      v_media_standard,
      true,
      true
    ),
    (
      v_room_pending_only,
      v_hotel_pending,
      'Garden Room',
      'standard',
      2200.00,
      NULL,
      2,
      '["wifi"]'::jsonb,
      'Room under a hotel that is still pending verification.',
      v_media_garden,
      false,
      true
    );

  INSERT INTO public.hotel_payment_methods (
    id,
    hotel_id,
    label,
    qr_image_path,
    account_name,
    account_number,
    sort_order
  )
  VALUES (
    v_pay_gcash,
    v_hotel_verified,
    'GCash (Demo)',
    NULL,
    'Marble Demo Resort',
    '09171234567',
    0
  );

  INSERT INTO public.user_preferences (
    user_id,
    budget_min,
    budget_max,
    amenities,
    travel_needs,
    hotel_preferences
  )
  VALUES (
    v_guest_bookings,
    2000,
    6000,
    '["wifi","sea_view","pool"]'::jsonb,
    'Family trip — need quiet nights and kid-friendly space.',
    'Prefer breakfast included and near the port.'
  );

  INSERT INTO public.bookings (
    id,
    user_id,
    room_id,
    check_in,
    check_out,
    booking_type,
    total_amount,
    status,
    payment_status,
    payment_method,
    payment_receipt_path,
    hotel_payment_method_id,
    hourly_hours
  )
  VALUES
    (
      v_book_pending,
      v_guest_bookings,
      v_room_verified_deluxe,
      (CURRENT_DATE + 14)::timestamptz,
      (CURRENT_DATE + 17)::timestamptz,
      'nightly',
      13500.00,
      'pending',
      'pending',
      'online',
      NULL,
      NULL,
      NULL
    ),
    (
      v_book_active,
      v_guest_bookings,
      v_room_verified_standard,
      (CURRENT_DATE + 3)::timestamptz,
      (CURRENT_DATE + 6)::timestamptz,
      'nightly',
      8400.00,
      'confirmed',
      'paid',
      'online',
      'demo-receipts/active-booking.png',
      v_pay_gcash,
      NULL
    ),
    (
      v_book_completed,
      v_guest_bookings,
      v_room_verified_deluxe,
      (CURRENT_DATE - 21)::timestamptz,
      (CURRENT_DATE - 18)::timestamptz,
      'nightly',
      13500.00,
      'completed',
      'paid',
      'cash',
      NULL,
      NULL,
      NULL
    );

  INSERT INTO public.reviews (id, booking_id, user_id, rating, comment)
  VALUES (
    gen_random_uuid(),
    v_book_completed,
    v_guest_bookings,
    5,
    'Excellent stay — demo review for completed booking.'
  );

  INSERT INTO public.booking_messages (id, booking_id, sender_id, body)
  VALUES (
    gen_random_uuid(),
    v_book_active,
    v_guest_bookings,
    'Hi! We will arrive around 3 PM. Demo message for in-app booking chat.'
  );

  UPDATE auth.users
  SET
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change = COALESCE(email_change, '')
  WHERE id IN (
    v_owner_verified,
    v_owner_pending,
    v_guest_onboarding,
    v_guest_bookings
  );

  RAISE NOTICE 'Seed: demo showcase created (hotels, rooms, guests, bookings). Password: demo_user1234';
END
$$;