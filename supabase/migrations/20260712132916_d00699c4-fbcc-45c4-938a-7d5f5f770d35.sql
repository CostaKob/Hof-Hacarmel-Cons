UPDATE public.students s
SET educational_school = r.educational_school
FROM public.registrations r
WHERE r.existing_student_id = s.id
  AND r.educational_school IS NOT NULL
  AND r.educational_school <> ''
  AND (s.educational_school IS NULL OR s.educational_school = '');