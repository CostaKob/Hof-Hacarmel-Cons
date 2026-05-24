DROP FUNCTION IF EXISTS public.list_public_school_music_classes(uuid);

CREATE FUNCTION public.list_public_school_music_classes(_school_id uuid)
 RETURNS TABLE(id uuid, school_music_school_id uuid, class_name text, day_of_week smallint, start_time time without time zone, end_time time without time zone, homeroom_teacher_name text, homeroom_teacher_phone text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, school_music_school_id, class_name, day_of_week, start_time, end_time, homeroom_teacher_name, homeroom_teacher_phone
  FROM public.school_music_classes
  WHERE school_music_school_id = _school_id
  ORDER BY class_name;
$function$;