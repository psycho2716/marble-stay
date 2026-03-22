-- Threaded messages between guest and hotel per booking (in-app only; no email in v1).
CREATE TABLE public.booking_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(trim(body)) > 0 AND char_length(body) <= 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_messages_booking_id_created ON public.booking_messages(booking_id, created_at);

ALTER TABLE public.booking_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_messages_select_guest"
  ON public.booking_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_messages.booking_id AND b.user_id = auth.uid()
    )
  );

CREATE POLICY "booking_messages_insert_guest"
  ON public.booking_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_messages.booking_id AND b.user_id = auth.uid()
    )
  );

CREATE POLICY "booking_messages_select_hotel"
  ON public.booking_messages FOR SELECT
  USING (
    public.get_user_role(auth.uid()) = 'hotel'
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.rooms r ON r.id = b.room_id
      WHERE b.id = booking_messages.booking_id
        AND r.hotel_id = public.get_user_hotel_id(auth.uid())
    )
  );

CREATE POLICY "booking_messages_insert_hotel"
  ON public.booking_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND public.get_user_role(auth.uid()) = 'hotel'
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.rooms r ON r.id = b.room_id
      WHERE b.id = booking_messages.booking_id
        AND r.hotel_id = public.get_user_hotel_id(auth.uid())
    )
  );

COMMENT ON TABLE public.booking_messages IS 'Guest ↔ hotel chat for a specific booking.';
