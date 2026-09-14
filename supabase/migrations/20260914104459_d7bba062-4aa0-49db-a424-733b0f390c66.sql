create or replace function public.get_public_branch_contacts(_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _year uuid;
  _name text;
  _sm_id uuid;
  _school_id uuid;
  _sm jsonb;
  _pv jsonb;
begin
  select id into _year from academic_years where is_active = true limit 1;

  _name := case lower(_slug)
    when 'haomer' then 'העמר'
    when 'carmelvayam' then 'כרמל וים'
    when 'carmel-vayam' then 'כרמל וים'
    when 'maaganim' then 'מעגנים'
    when 'caesarea' then 'קיסריה'
    when 'sitrin' then 'סיטרין בנות'
    else null
  end;

  if _name is null then
    select school_name into _name from school_music_schools
    where lower(slug) = lower(_slug) limit 1;
  end if;

  if _name is null then
    return null;
  end if;

  select id into _sm_id from school_music_schools
  where school_name = _name and (academic_year_id = _year or _year is null)
  order by is_active desc limit 1;

  select id into _school_id from schools
  where name = _name
     or (_name = 'סיטרין בנות' and name = 'סיטרין')
  limit 1;

  -- school music staff
  with base as (
    select s.coordinator_teacher_id as tid, 'רכז בית ספר מנגן'::text as role
    from school_music_schools s where s.id = _sm_id and s.coordinator_teacher_id is not null
    union all
    select s.conductor_teacher_id, 'מנצח'
    from school_music_schools s where s.id = _sm_id and s.conductor_teacher_id is not null
    union all
    select g.teacher_id, coalesce('מורה ' || i.name, 'מורה')
    from school_music_class_groups g
    join school_music_classes c on c.id = g.school_music_class_id
    left join instruments i on i.id = g.instrument_id
    where c.school_music_school_id = _sm_id and g.teacher_id is not null
  )
  select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) into _sm
  from (
    select jsonb_build_object(
      'name', trim(coalesce(t.first_name,'') || ' ' || coalesce(t.last_name,'')),
      'phone', t.phone,
      'email', t.email,
      'roles', array_agg(distinct b.role)
    ) as x
    from base b join teachers t on t.id = b.tid
    group by t.id, t.first_name, t.last_name, t.phone, t.email
  ) q;

  -- private lessons staff
  with base as (
    select bc.teacher_id as tid, 'רכז שלוחה'::text as role
    from branch_coordinators bc where bc.school_id = _school_id
    union all
    select e.teacher_id, coalesce('מורה ' || i.name, 'מורה')
    from enrollments e
    left join instruments i on i.id = e.instrument_id
    where e.school_id = _school_id
      and e.teacher_id is not null
      and (e.academic_year_id = _year or _year is null)
      and coalesce(e.is_active, true)
  )
  select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) into _pv
  from (
    select jsonb_build_object(
      'name', trim(coalesce(t.first_name,'') || ' ' || coalesce(t.last_name,'')),
      'phone', t.phone,
      'email', t.email,
      'roles', array_agg(distinct b.role)
    ) as x
    from base b join teachers t on t.id = b.tid
    group by t.id, t.first_name, t.last_name, t.phone, t.email
  ) q;

  return jsonb_build_object(
    'branch_name', _name,
    'school_music', coalesce(_sm, '[]'::jsonb),
    'private', coalesce(_pv, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_public_branch_contacts(text) to anon, authenticated;