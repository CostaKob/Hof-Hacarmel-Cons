CREATE OR REPLACE FUNCTION public.get_student_payment_public_status(_payment_id uuid)
RETURNS TABLE (
  id uuid,
  payment_status student_payment_status,
  amount numeric,
  invoice_url text,
  icount_doc_number text,
  paid_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, payment_status, amount, invoice_url, icount_doc_number, paid_at
  FROM public.student_payments
  WHERE id = _payment_id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_student_payment_public_status(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_student_payment_public_status(uuid) TO anon, authenticated;