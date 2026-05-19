
-- 1. Add annual tuition fee to school_music_schools
ALTER TABLE public.school_music_schools
  ADD COLUMN IF NOT EXISTS annual_tuition_fee numeric NOT NULL DEFAULT 650;

-- 2. Create payment status enum
DO $$ BEGIN
  CREATE TYPE public.school_music_payment_status AS ENUM ('pending', 'paid', 'refunded', 'failed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Create school_music_payments table
CREATE TABLE IF NOT EXISTS public.school_music_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_music_student_id uuid NOT NULL,
  school_music_school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  amount numeric NOT NULL,
  payment_status public.school_music_payment_status NOT NULL DEFAULT 'pending',
  payment_method text,
  transaction_reference text,
  icount_doc_id text,
  icount_doc_number text,
  invoice_url text,
  paid_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smp_student ON public.school_music_payments(school_music_student_id);
CREATE INDEX IF NOT EXISTS idx_smp_school ON public.school_music_payments(school_music_school_id);
CREATE INDEX IF NOT EXISTS idx_smp_year ON public.school_music_payments(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_smp_status ON public.school_music_payments(payment_status);

ALTER TABLE public.school_music_payments ENABLE ROW LEVEL SECURITY;

-- Admins manage all
CREATE POLICY "Admins can manage school_music_payments"
  ON public.school_music_payments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Anyone (anon + auth) can insert (registration flow)
CREATE POLICY "Anyone can submit school_music_payments"
  ON public.school_music_payments
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Anyone can select by id (needed for payment page lookup)
CREATE POLICY "Anyone can view school_music_payments"
  ON public.school_music_payments
  FOR SELECT TO anon, authenticated
  USING (true);

-- updated_at trigger
CREATE TRIGGER update_school_music_payments_updated_at
  BEFORE UPDATE ON public.school_music_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
