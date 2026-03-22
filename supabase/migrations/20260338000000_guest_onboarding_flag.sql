-- Track whether a guest has finished first-run preference onboarding (AI + recommendations).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS guest_onboarding_completed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.guest_onboarding_completed IS 'Guest-only: false until user completes onboarding preferences; hotels/admins should stay true.';

-- Existing accounts: skip onboarding (already using the app).
UPDATE public.profiles SET guest_onboarding_completed = true WHERE role = 'guest';

UPDATE public.profiles SET guest_onboarding_completed = true WHERE role IN ('hotel', 'admin');
