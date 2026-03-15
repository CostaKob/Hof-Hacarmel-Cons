
-- Add custom_data and registration_page_id to registrations
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS custom_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS registration_page_id uuid;

-- Create registration_pages table
CREATE TABLE public.registration_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  is_open boolean NOT NULL DEFAULT false,
  approval_text text NOT NULL DEFAULT 'קראתי את המידע ואני מאשר/ת את תנאי ההרשמה והלימודים',
  success_message text NOT NULL DEFAULT 'ההרשמה נקלטה בהצלחה! ניצור קשר לאחר בדיקת הפרטים.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(academic_year_id)
);

ALTER TABLE public.registration_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage registration_pages" ON public.registration_pages
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view registration_pages" ON public.registration_pages
  FOR SELECT TO anon, authenticated
  USING (true);

-- Create registration_page_sections table
CREATE TABLE public.registration_page_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.registration_pages(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.registration_page_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage registration_page_sections" ON public.registration_page_sections
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view registration_page_sections" ON public.registration_page_sections
  FOR SELECT TO anon, authenticated
  USING (true);

-- Create registration_page_fields table
CREATE TABLE public.registration_page_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.registration_pages(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  is_required boolean NOT NULL DEFAULT false,
  options jsonb DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  help_text text DEFAULT '',
  section_title text DEFAULT '',
  placeholder text DEFAULT '',
  data_source text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.registration_page_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage registration_page_fields" ON public.registration_page_fields
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view registration_page_fields" ON public.registration_page_fields
  FOR SELECT TO anon, authenticated
  USING (true);

-- Trigger for updated_at on registration_pages
CREATE TRIGGER update_registration_pages_updated_at
  BEFORE UPDATE ON public.registration_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add FK from registrations to registration_pages
ALTER TABLE public.registrations 
  ADD CONSTRAINT registrations_registration_page_id_fkey 
  FOREIGN KEY (registration_page_id) REFERENCES public.registration_pages(id) ON DELETE SET NULL;
