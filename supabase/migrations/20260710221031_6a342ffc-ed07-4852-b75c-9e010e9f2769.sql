UPDATE public.student_payments sp
SET academic_year_id = (
  SELECT id
  FROM public.academic_years
  WHERE is_active = true
  LIMIT 1
)
WHERE sp.payment_status = 'pending'
  AND sp.payment_link_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.academic_years ay
    WHERE ay.id = sp.academic_year_id
      AND ay.is_active = true
  );