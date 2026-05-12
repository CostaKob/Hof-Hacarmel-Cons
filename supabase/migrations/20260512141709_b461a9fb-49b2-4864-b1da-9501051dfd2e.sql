ALTER TABLE public.student_payments DROP CONSTRAINT IF EXISTS student_payments_amount_check;
ALTER TABLE public.student_payments ADD CONSTRAINT student_payments_amount_check CHECK (amount <> 0);