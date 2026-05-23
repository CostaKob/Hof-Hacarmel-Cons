
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS icount_page_id text;
UPDATE public.schools
  SET icount_page_id = CASE WHEN name ILIKE '%קיסריה%' THEN '04dcb' ELSE '675e7' END
  WHERE icount_page_id IS NULL;

ALTER TABLE public.student_payments ADD COLUMN IF NOT EXISTS icount_transaction_id text;
ALTER TABLE public.student_payments ALTER COLUMN enrollment_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_payments_icount_transaction_id ON public.student_payments(icount_transaction_id);
