
CREATE TABLE public.educational_schools (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  city text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.educational_schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage educational_schools"
  ON public.educational_schools FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anon can view educational_schools"
  ON public.educational_schools FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated can view educational_schools"
  ON public.educational_schools FOR SELECT
  TO authenticated
  USING (true);
