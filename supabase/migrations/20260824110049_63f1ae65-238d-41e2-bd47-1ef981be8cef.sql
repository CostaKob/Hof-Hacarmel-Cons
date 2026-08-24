CREATE TABLE public.family_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_national_id text NOT NULL,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  title text,
  content text NOT NULL,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_notes TO authenticated;
GRANT ALL ON public.family_notes TO service_role;

ALTER TABLE public.family_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Office staff can view family notes"
ON public.family_notes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Office staff can insert family notes"
ON public.family_notes FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Office staff can update family notes"
ON public.family_notes FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Office staff can delete family notes"
ON public.family_notes FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'));

CREATE INDEX idx_family_notes_parent ON public.family_notes(parent_national_id);

CREATE TRIGGER family_notes_updated_at
BEFORE UPDATE ON public.family_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();