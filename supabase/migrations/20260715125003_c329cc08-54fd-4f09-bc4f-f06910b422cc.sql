REVOKE ALL ON FUNCTION public.preserve_student_payment_draft_custom_discounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preserve_student_payment_draft_custom_discounts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.preserve_student_payment_draft_custom_discounts() TO service_role;