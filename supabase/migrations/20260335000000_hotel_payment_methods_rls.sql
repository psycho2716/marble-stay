-- ============================================================
-- RLS on hotel_payment_methods
-- - Service role (backend) bypasses RLS — existing API routes unchanged.
-- - Verified hotels: rows readable by anyone (matches public room/payment UX;
--   required so guest INSERT into bookings can satisfy FK to hotel_payment_method_id under RLS).
-- - Hotel role: full read/write/delete on own hotel_id rows (including unverified hotels).
-- - Admin: full access.
-- ============================================================

ALTER TABLE public.hotel_payment_methods ENABLE ROW LEVEL SECURITY;

-- Read: payment options for verified hotels (guest booking FK + public parity)
CREATE POLICY "hotel_payment_methods_select_verified_hotel"
  ON public.hotel_payment_methods
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.hotels h
      WHERE h.id = hotel_payment_methods.hotel_id
        AND h.verification_status = 'verified'
    )
  );

-- Read: hotel staff always see their own hotel's methods (incl. pending verification)
CREATE POLICY "hotel_payment_methods_select_own_hotel"
  ON public.hotel_payment_methods
  FOR SELECT
  USING (
    public.get_user_role(auth.uid()) = 'hotel'
    AND hotel_id = public.get_user_hotel_id(auth.uid())
  );

CREATE POLICY "hotel_payment_methods_insert_own_hotel"
  ON public.hotel_payment_methods
  FOR INSERT
  WITH CHECK (
    public.get_user_role(auth.uid()) = 'hotel'
    AND hotel_id = public.get_user_hotel_id(auth.uid())
  );

CREATE POLICY "hotel_payment_methods_update_own_hotel"
  ON public.hotel_payment_methods
  FOR UPDATE
  USING (
    public.get_user_role(auth.uid()) = 'hotel'
    AND hotel_id = public.get_user_hotel_id(auth.uid())
  )
  WITH CHECK (
    public.get_user_role(auth.uid()) = 'hotel'
    AND hotel_id = public.get_user_hotel_id(auth.uid())
  );

CREATE POLICY "hotel_payment_methods_delete_own_hotel"
  ON public.hotel_payment_methods
  FOR DELETE
  USING (
    public.get_user_role(auth.uid()) = 'hotel'
    AND hotel_id = public.get_user_hotel_id(auth.uid())
  );

CREATE POLICY "hotel_payment_methods_admin_all"
  ON public.hotel_payment_methods
  FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

COMMENT ON POLICY "hotel_payment_methods_select_verified_hotel" ON public.hotel_payment_methods IS
  'Allow SELECT for providers of verified hotels (guest FK on bookings, optional direct Supabase reads).';
