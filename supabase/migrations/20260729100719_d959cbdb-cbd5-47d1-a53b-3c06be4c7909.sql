UPDATE public.enrollments e
SET grade = 'ו'
FROM public.students s
WHERE e.student_id = s.id
  AND s.first_name = 'אילינוב'
  AND s.last_name = 'בנימין'
  AND e.grade = 'ה';