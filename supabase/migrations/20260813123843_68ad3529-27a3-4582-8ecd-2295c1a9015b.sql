-- Add school_id (branch) to branch_coordinators
ALTER TABLE public.branch_coordinators
ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL;

-- Security definer functions for branch coordinator checks
create or replace function public.is_branch_coordinator_of(_user_id uuid, _school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.branch_coordinators bc
    join public.teachers t on t.id = bc.teacher_id
    where t.user_id = _user_id
      and bc.school_id = _school_id
  );
$$;

create or replace function public.is_branch_coordinator_any(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.branch_coordinators bc
    join public.teachers t on t.id = bc.teacher_id
    where t.user_id = _user_id
      and bc.school_id is not null
  );
$$;

create or replace function public.get_branch_coordinator_school_ids(_user_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select array_agg(bc.school_id)
  from public.branch_coordinators bc
  join public.teachers t on t.id = bc.teacher_id
  where t.user_id = _user_id
    and bc.school_id is not null;
$$;

-- RLS policies for branch coordinators (read-only)

-- Enrollments: read enrollments in coordinated branches
create policy "Branch coordinators can view enrollments in their branches"
  on public.enrollments
  for select
  to authenticated
  using (public.is_branch_coordinator_of(auth.uid(), school_id));

-- Students: read students with at least one active enrollment in a coordinated branch
create policy "Branch coordinators can view students in their branches"
  on public.students
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.enrollments e
      where e.student_id = students.id
        and e.is_active = true
        and public.is_branch_coordinator_of(auth.uid(), e.school_id)
    )
  );

-- Teachers: read teachers who teach in a coordinated branch
create policy "Branch coordinators can view teachers in their branches"
  on public.teachers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.enrollments e
      where e.teacher_id = teachers.id
        and e.is_active = true
        and public.is_branch_coordinator_of(auth.uid(), e.school_id)
    )
  );

-- Reports: read reports in coordinated branches
create policy "Branch coordinators can view reports in their branches"
  on public.reports
  for select
  to authenticated
  using (public.is_branch_coordinator_of(auth.uid(), school_id));

-- Report lines: read report lines for reports in coordinated branches
create policy "Branch coordinators can view report lines in their branches"
  on public.report_lines
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.reports r
      where r.id = report_lines.report_id
        and public.is_branch_coordinator_of(auth.uid(), r.school_id)
    )
  );

-- Registrations: read registrations whose branch_school_name matches a coordinated branch name
create policy "Branch coordinators can view registrations for their branches"
  on public.registrations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.branch_coordinators bc
      join public.teachers t on t.id = bc.teacher_id
      join public.schools s on s.id = bc.school_id
      where t.user_id = auth.uid()
        and bc.school_id is not null
        and s.name = registrations.branch_school_name
    )
  );