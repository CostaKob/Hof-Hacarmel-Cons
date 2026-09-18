create or replace function public.global_search(p_query text)
returns table(kind text, id text, title text, subtitle text, path text)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select
      '%' || trim(p_query) || '%' as pat,
      '%' || replace(replace(trim(p_query), '-', ''), ' ', '') || '%' as phonepat,
      trim(p_query) as raw
  )
  select * from (
    (select 'student', s.id::text,
            trim(s.first_name || ' ' || s.last_name),
            trim(concat_ws(' · ',
              nullif('כיתה ' || coalesce(s.grade,''), 'כיתה '),
              nullif(s.city,''),
              nullif(s.parent_name,''))),
            '/admin/students/' || s.id
     from students s, q
     where (s.first_name || ' ' || s.last_name) ilike q.pat
        or (s.last_name || ' ' || s.first_name) ilike q.pat
        or s.national_id like q.raw || '%'
        or replace(coalesce(s.phone,''),'-','') like q.phonepat
        or coalesce(s.parent_name,'') ilike q.pat
        or coalesce(s.parent_name_2,'') ilike q.pat
        or replace(coalesce(s.parent_phone,''),'-','') like q.phonepat
        or replace(coalesce(s.parent_phone_2,''),'-','') like q.phonepat
     limit 8)
    union all
    (select 'parent', p.national_id, p.full_name,
            trim(concat_ws(' · ', nullif(p.phone,''), nullif(p.email,''))),
            '/admin/families/' || p.national_id
     from parents p, q
     where p.full_name ilike q.pat
        or p.national_id like q.raw || '%'
        or replace(coalesce(p.phone,''),'-','') like q.phonepat
        or coalesce(p.email,'') ilike q.pat
     limit 8)
    union all
    (select 'teacher', t.id::text, trim(t.first_name || ' ' || t.last_name),
            coalesce(nullif(t.phone,''), ''),
            '/admin/teachers/' || t.id
     from teachers t, q
     where (t.first_name || ' ' || t.last_name) ilike q.pat
        or (t.last_name || ' ' || t.first_name) ilike q.pat
        or t.national_id like q.raw || '%'
        or replace(coalesce(t.phone,''),'-','') like q.phonepat
     limit 8)
    union all
    (select 'branch', sc.id::text, sc.name,
            trim(concat_ws(' · ', nullif(sc.city,''), nullif(sc.address,''))),
            '/admin/schools/' || sc.id || '/edit'
     from schools sc, q
     where sc.name ilike q.pat or coalesce(sc.city,'') ilike q.pat
     limit 6)
    union all
    (select 'ensemble', e.id::text, e.name, 'הרכב',
            '/admin/ensembles/' || e.id
     from ensembles e, q
     where e.name ilike q.pat
     limit 6)
    union all
    (select 'sm_school', sm.id::text, sm.school_name, 'בית ספר מנגן',
            '/admin/school-music-schools/' || sm.id
     from school_music_schools sm, q
     where sm.school_name ilike q.pat
     limit 6)
    union all
    (select 'sm_student', sms.id::text,
            trim(sms.student_first_name || ' ' || sms.student_last_name),
            trim(concat_ws(' · ', nullif(sms.parent_name,''), nullif(sms.class_name,''))),
            '/admin/school-music-students/' || sms.id
     from school_music_students sms, q
     where (sms.student_first_name || ' ' || sms.student_last_name) ilike q.pat
        or (sms.student_last_name || ' ' || sms.student_first_name) ilike q.pat
        or sms.student_national_id like q.raw || '%'
        or coalesce(sms.parent_name,'') ilike q.pat
        or replace(coalesce(sms.parent_phone,''),'-','') like q.phonepat
        or coalesce(sms.instrument_serial_number,'') ilike q.pat
     limit 8)
    union all
    (select 'instrument', ii.id::text,
            trim(concat_ws(' ', i.name, nullif(ii.serial_number,''))),
            trim(concat_ws(' · ', nullif(ii.brand,''), nullif(ii.model,''))),
            '/admin/inventory-instruments/' || ii.id || '/edit'
     from inventory_instruments ii
     left join instruments i on i.id = ii.instrument_id
     , q
     where coalesce(ii.serial_number,'') ilike q.pat
        or coalesce(ii.brand,'') ilike q.pat
        or coalesce(ii.model,'') ilike q.pat
     limit 8)
    union all
    (select 'registration', r.id::text,
            trim(r.student_first_name || ' ' || r.student_last_name),
            trim(concat_ws(' · ', nullif(r.parent_name,''), nullif(r.city,''))),
            '/admin/registrations/' || r.id
     from registrations r, q
     where (r.student_first_name || ' ' || r.student_last_name) ilike q.pat
        or r.student_national_id like q.raw || '%'
        or coalesce(r.parent_name,'') ilike q.pat
        or replace(coalesce(r.parent_phone,''),'-','') like q.phonepat
     limit 6)
  ) results
  where public.has_role(auth.uid(), 'admin'::app_role)
     or public.has_role(auth.uid(), 'owner'::app_role)
  limit 40;
$$;

grant execute on function public.global_search(text) to authenticated;