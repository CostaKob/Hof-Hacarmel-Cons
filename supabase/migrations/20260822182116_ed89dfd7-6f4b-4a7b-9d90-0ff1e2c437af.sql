CREATE OR REPLACE FUNCTION public.is_ensemble_conductor_any(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ensemble_staff es
    WHERE es.role = 'conductor'::ensemble_staff_role
      AND es.teacher_id = public.get_teacher_id_for_user(_user_id)
  )
$$;

DROP POLICY IF EXISTS "Coordinators can create calendar change requests" ON public.calendar_change_requests;

CREATE POLICY "Coordinators can create calendar change requests"
ON public.calendar_change_requests
FOR INSERT
TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND status = 'pending'
  AND (
    public.is_sm_coordinator_any(auth.uid())
    OR public.is_branch_coordinator_any(auth.uid())
    OR public.is_ensemble_conductor_any(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);