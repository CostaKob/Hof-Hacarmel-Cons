
CREATE TABLE public.registration_form_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  is_open boolean NOT NULL DEFAULT false,
  form_title text NOT NULL DEFAULT '',
  approval_text text NOT NULL DEFAULT 'קראתי את המידע ואני מאשר/ת את תנאי ההרשמה והלימודים',
  info_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(academic_year_id)
);

ALTER TABLE public.registration_form_settings ENABLE ROW LEVEL SECURITY;

-- Admins can manage
CREATE POLICY "Admins can manage registration_form_settings"
  ON public.registration_form_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Anyone can view active settings (for the public form)
CREATE POLICY "Anyone can view registration_form_settings"
  ON public.registration_form_settings FOR SELECT
  TO anon, authenticated
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_registration_form_settings_updated_at
  BEFORE UPDATE ON public.registration_form_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
