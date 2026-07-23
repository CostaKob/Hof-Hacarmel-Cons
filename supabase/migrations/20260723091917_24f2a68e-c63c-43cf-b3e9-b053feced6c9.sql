CREATE OR REPLACE FUNCTION public.get_student_payment_public_status(_payment_id uuid)
 RETURNS TABLE(id uuid, payment_status student_payment_status, amount numeric, invoice_url text, icount_doc_number text, paid_at timestamp with time zone, recipient_email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT sp.id, sp.payment_status, sp.amount, sp.invoice_url, sp.icount_doc_number, sp.paid_at,
         COALESCE(
           NULLIF(TRIM(BOTH FROM (sp.enrollment_breakdown->'payerDetails'->>'email')), ''),
           NULLIF(s.parent_email, ''),
           NULLIF(s.parent_email_2, '')
         ) AS recipient_email
  FROM public.student_payments sp
  LEFT JOIN public.students s ON s.id = sp.student_id
  WHERE sp.id = _payment_id
  LIMIT 1;
$function$;