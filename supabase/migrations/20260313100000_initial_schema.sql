-- (legacy duplicated initial schema block removed; see definitions below)
-- ============================================================
-- Centralized Romblon Hotel Booking System — Initial Schema
-- Supabase / PostgreSQL
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM TYPES (for strict constraint and clarity)
-- ============================================================

CREATE TYPE app_role AS ENUM ('guest', 'hotel', 'admin');
CREATE TYPE hotel_verification_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE booking_type AS ENUM ('nightly', 'hourly');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'refunded');

-- ============================================================
-- HOTELS (created before profiles so profiles.hotel_id can reference)
-- ============================================================

CREATE TABLE public.hotels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  images TEXT[] DEFAULT '{}',
  verification_status hotel_verification_status NOT NULL DEFAULT 'pending',
  business_permit_file TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hotels_lat_lng CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  )
);

COMMENT ON COLUMN public.hotels.business_permit_file IS 'Supabase Storage URL for business permit (PDF or image).';
COMMENT ON COLUMN public.hotels.verification_status IS 'Admin must set to verified for hotel to appear in search and use dashboard.';

-- ============================================================
-- PROFILES (extends Supabase Auth; 1:1 with auth.users)
-- ============================================================

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role app_role NOT NULL DEFAULT 'guest',
  hotel_id UUID NULL REFERENCES public.hotels(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'User profiles; role hotel links to one hotel via hotel_id.';
COMMENT ON COLUMN public.profiles.role IS 'guest | hotel | admin. No separate staff profile.';

-- ============================================================
-- ROOMS
-- ============================================================

CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  room_type TEXT NOT NULL,
  base_price_night DECIMAL(10, 2) NOT NULL CHECK (base_price_night >= 0),
  hourly_rate DECIMAL(10, 2) CHECK (hourly_rate IS NULL OR hourly_rate >= 0),
  capacity INT NOT NULL CHECK (capacity > 0),
  amenities JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.rooms IS 'Rooms per hotel; hourly_rate used for micro-stay.';

-- ============================================================
-- ROOM AVAILABILITY (nightly)
-- ============================================================

CREATE TABLE public.room_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  available BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(room_id, date)
);

CREATE INDEX idx_room_availability_room_date ON public.room_availability(room_id, date);

-- ============================================================
-- ROOM HOURLY SLOTS (micro-stay)
-- ============================================================

CREATE TABLE public.room_hourly_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hour SMALLINT NOT NULL CHECK (hour >= 0 AND hour <= 23),
  available BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(room_id, date, hour)
);

CREATE INDEX idx_room_hourly_slots_room_date_hour ON public.room_hourly_slots(room_id, date, hour);

-- ============================================================
-- BOOKINGS
-- ============================================================

CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  check_in TIMESTAMPTZ NOT NULL,
  check_out TIMESTAMPTZ NOT NULL,
  booking_type booking_type NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
  status booking_status NOT NULL DEFAULT 'pending',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bookings_check_out_after_check_in CHECK (check_out > check_in)
);

CREATE INDEX idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX idx_bookings_room_id ON public.bookings(room_id);
CREATE INDEX idx_bookings_dates ON public.bookings(room_id, check_in, check_out);
CREATE INDEX idx_bookings_status ON public.bookings(status);

-- ============================================================
-- REVIEWS
-- ============================================================

CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(booking_id)
);

CREATE INDEX idx_reviews_booking_id ON public.reviews(booking_id);
CREATE INDEX idx_reviews_user_id ON public.reviews(user_id);

-- ============================================================
-- USER PREFERENCES (for recommendations)
-- ============================================================

CREATE TABLE public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  budget_min DECIMAL(10, 2) CHECK (budget_min IS NULL OR budget_min >= 0),
  budget_max DECIMAL(10, 2) CHECK (budget_max IS NULL OR budget_max >= 0),
  amenities JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_preferences_budget CHECK (
    budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max
  )
);

-- ============================================================
-- UPDATED_AT TRIGGER (reusable)
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER hotels_updated_at
  BEFORE UPDATE ON public.hotels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
