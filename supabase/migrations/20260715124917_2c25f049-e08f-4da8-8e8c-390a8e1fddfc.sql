CREATE OR REPLACE FUNCTION public.preserve_student_payment_draft_custom_discounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snapshot_custom jsonb;
BEGIN
  IF COALESCE(jsonb_array_length(NEW.custom_discounts), 0) = 0 THEN
    IF TG_OP = 'UPDATE' AND OLD.custom_discounts IS NOT NULL AND jsonb_array_length(OLD.custom_discounts) > 0 THEN
      NEW.custom_discounts := OLD.custom_discounts;
    ELSE
      SELECT sp.enrollment_breakdown #> '{discounts,customDiscounts}'
      INTO snapshot_custom
      FROM public.student_payments sp
      WHERE sp.student_id = NEW.student_id
        AND sp.academic_year_id = NEW.academic_year_id
        AND sp.enrollment_breakdown #> '{discounts,customDiscounts}' IS NOT NULL
        AND jsonb_typeof(sp.enrollment_breakdown #> '{discounts,customDiscounts}') = 'array'
        AND jsonb_array_length(sp.enrollment_breakdown #> '{discounts,customDiscounts}') > 0
        AND COALESCE(sp.payment_status::text, 'paid') IN ('pending', 'paid')
      ORDER BY sp.created_at DESC
      LIMIT 1;

      IF snapshot_custom IS NOT NULL THEN
        NEW.custom_discounts := snapshot_custom;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preserve_student_payment_draft_custom_discounts_trigger ON public.student_payment_drafts;

CREATE TRIGGER preserve_student_payment_draft_custom_discounts_trigger
BEFORE INSERT OR UPDATE OF custom_discounts ON public.student_payment_drafts
FOR EACH ROW
EXECUTE FUNCTION public.preserve_student_payment_draft_custom_discounts();