ALTER TABLE public.schools DROP COLUMN IF EXISTS icount_page_id;
ALTER TABLE public.student_payments DROP COLUMN IF EXISTS icount_transaction_id;

ALTER TABLE public.school_music_payments ADD COLUMN IF NOT EXISTS icount_transaction_id text;
ALTER TABLE public.school_music_students ADD COLUMN IF NOT EXISTS icount_payment_url text;