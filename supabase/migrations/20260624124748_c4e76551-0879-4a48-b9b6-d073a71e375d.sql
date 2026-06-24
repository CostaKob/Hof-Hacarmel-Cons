
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS photo_url TEXT;

DROP FUNCTION IF EXISTS public.get_public_teachers();
CREATE OR REPLACE FUNCTION public.get_public_teachers()
 RETURNS TABLE(id uuid, first_name text, last_name text, gender text, bio text, photo_url text, instruments text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.id, t.first_name, t.last_name, t.gender, t.bio, t.photo_url,
         COALESCE(array_agg(i.name ORDER BY i.name) FILTER (WHERE i.name IS NOT NULL), ARRAY[]::text[]) AS instruments
  FROM public.teachers t
  LEFT JOIN public.teacher_instruments ti ON ti.teacher_id = t.id
  LEFT JOIN public.instruments i ON i.id = ti.instrument_id
  WHERE t.is_active = true
    AND COALESCE(t.is_office, false) = false
  GROUP BY t.id, t.first_name, t.last_name, t.gender, t.bio, t.photo_url
  ORDER BY t.first_name, t.last_name;
$function$;

-- Storage policies for teacher-photos bucket
CREATE POLICY "Public can view teacher photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'teacher-photos');

CREATE POLICY "Admins can upload teacher photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'teacher-photos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update teacher photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'teacher-photos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete teacher photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'teacher-photos' AND public.has_role(auth.uid(), 'admin'));
