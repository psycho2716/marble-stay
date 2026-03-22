-- Server-side cache for AI "For you" recommendations (12h TTL per guest).
-- Written/read only via backend service role (RLS: no policies for JWT clients).

CREATE TABLE IF NOT EXISTS public.personalized_recommendation_cache (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  response_json JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personalized_recommendation_cache_expires_at
  ON public.personalized_recommendation_cache (expires_at);

COMMENT ON TABLE public.personalized_recommendation_cache IS
  'Caches GET /api/recommendations/personalized JSON (without signed image URLs) for 12 hours per user.';

ALTER TABLE public.personalized_recommendation_cache ENABLE ROW LEVEL SECURITY;
