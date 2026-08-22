CREATE TABLE public.calendar_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL CHECK (action IN ('create','update','delete')),
  calendar_item_id uuid,
  payload jsonb,
  snapshot jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by uuid NOT NULL DEFAULT auth.uid(),
  requested_by_name text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_change_requests TO authenticated;
GRANT ALL ON public.calendar_change_requests TO service_role;

ALTER TABLE public.calendar_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coordinators can create calendar change requests"
ON public.calendar_change_requests FOR INSERT TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND status = 'pending'
  AND (
    public.is_sm_coordinator_any(auth.uid())
    OR public.is_branch_coordinator_any(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Requesters can view their own calendar change requests"
ON public.calendar_change_requests FOR SELECT TO authenticated
USING (requested_by = auth.uid());

CREATE POLICY "Admins can view all calendar change requests"
ON public.calendar_change_requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can review calendar change requests"
ON public.calendar_change_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER calendar_change_requests_updated_at
BEFORE UPDATE ON public.calendar_change_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_calendar_change_requests_status ON public.calendar_change_requests (status, created_at DESC);