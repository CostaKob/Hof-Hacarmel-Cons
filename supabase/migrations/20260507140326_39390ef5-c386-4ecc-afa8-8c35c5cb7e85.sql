-- Payment module infrastructure

-- 1. Lesson prices per duration + VAT (singleton table)
CREATE TABLE public.payment_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_prices jsonb NOT NULL DEFAULT '{"30": 0, "45": 0, "60": 0}'::jsonb,
  vat_rate numeric NOT NULL DEFAULT 18,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage payment_settings" ON public.payment_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated view payment_settings" ON public.payment_settings
  FOR SELECT TO authenticated USING (true);

-- Seed singleton row
INSERT INTO public.payment_settings (lesson_prices, vat_rate)
VALUES ('{"30": 0, "45": 0, "60": 0}'::jsonb, 18);

-- 2. Discount rates on academic_years
ALTER TABLE public.academic_years
  ADD COLUMN discount_sibling_pct numeric NOT NULL DEFAULT 5,
  ADD COLUMN discount_second_instrument_pct numeric NOT NULL DEFAULT 5,
  ADD COLUMN discount_major_student_pct numeric NOT NULL DEFAULT 10;

-- 3. Major student flag
ALTER TABLE public.students
  ADD COLUMN is_major_student boolean NOT NULL DEFAULT false;

-- 4. Updated_at trigger for payment_settings
CREATE TRIGGER update_payment_settings_updated_at
  BEFORE UPDATE ON public.payment_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();