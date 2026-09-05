CREATE TABLE public.branch_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  day_of_week smallint not null,
  start_minutes integer not null,
  duration_minutes integer not null default 30,
  room text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year_id, enrollment_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_schedule_slots TO authenticated;
GRANT ALL ON public.branch_schedule_slots TO service_role;

ALTER TABLE public.branch_schedule_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view branch schedule"
ON public.branch_schedule_slots FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins manage branch schedule"
ON public.branch_schedule_slots FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary') OR public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary') OR public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER branch_schedule_slots_updated_at
BEFORE UPDATE ON public.branch_schedule_slots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();