create or replace function public.mark_student_not_continuing(_student_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _teacher_id uuid;
  _has_enrollment boolean;
begin
  _teacher_id := public.get_teacher_id_for_user(auth.uid());
  if _teacher_id is null then
    raise exception 'User is not a teacher' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from public.enrollments e
    where e.teacher_id = _teacher_id
      and e.student_id = _student_id
  ) into _has_enrollment;

  if not _has_enrollment then
    raise exception 'Teacher has no enrollment with this student' using errcode = 'P0001';
  end if;

  update public.students
  set student_status = 'לא ימשיך'
  where id = _student_id;

  return found;
end;
$$;

grant execute on function public.mark_student_not_continuing(uuid) to authenticated;
