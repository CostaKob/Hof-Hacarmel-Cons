
-- ============ 1. CREATE parents TABLE ============
CREATE TABLE public.parents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  national_id text NOT NULL UNIQUE,
  full_name text,
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parents TO authenticated;
GRANT ALL ON public.parents TO service_role;

ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER parents_updated_at
  BEFORE UPDATE ON public.parents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============ 2. ADD FK columns to students ============
ALTER TABLE public.students
  ADD COLUMN parent_1_id uuid REFERENCES public.parents(id) ON DELETE SET NULL,
  ADD COLUMN parent_2_id uuid REFERENCES public.parents(id) ON DELETE SET NULL;

CREATE INDEX idx_students_parent_1_id ON public.students(parent_1_id);
CREATE INDEX idx_students_parent_2_id ON public.students(parent_2_id);

-- Policies (after parent_1_id/parent_2_id columns exist)
CREATE POLICY "Admins can manage parents"
  ON public.parents FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Secretaries can manage parents"
  ON public.parents FOR ALL
  USING (public.has_role(auth.uid(), 'secretary'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'secretary'::app_role));

CREATE POLICY "Teachers can view parents of their students"
  ON public.parents FOR SELECT
  USING (
    id IN (
      SELECT s.parent_1_id FROM public.students s
      JOIN public.enrollments e ON e.student_id = s.id
      WHERE e.teacher_id = public.get_teacher_id_for_user(auth.uid())
      UNION
      SELECT s.parent_2_id FROM public.students s
      JOIN public.enrollments e ON e.student_id = s.id
      WHERE e.teacher_id = public.get_teacher_id_for_user(auth.uid())
    )
  );

-- ============ 3. BACKFILL parents from existing student data ============
-- Collect all (national_id, name, phone, email, created_at) tuples from both parent slots,
-- pick the most recent non-null values per national_id, and insert into parents.
WITH all_parent_rows AS (
  SELECT
    NULLIF(TRIM(parent_national_id), '') AS nid,
    parent_name AS full_name,
    parent_phone AS phone,
    parent_email AS email,
    created_at
  FROM public.students
  WHERE NULLIF(TRIM(parent_national_id), '') IS NOT NULL
  UNION ALL
  SELECT
    NULLIF(TRIM(parent_national_id_2), '') AS nid,
    parent_name_2 AS full_name,
    parent_phone_2 AS phone,
    parent_email_2 AS email,
    created_at
  FROM public.students
  WHERE NULLIF(TRIM(parent_national_id_2), '') IS NOT NULL
),
picked AS (
  SELECT
    nid,
    (ARRAY_AGG(full_name ORDER BY created_at DESC NULLS LAST) FILTER (WHERE full_name IS NOT NULL AND TRIM(full_name) <> ''))[1] AS full_name,
    (ARRAY_AGG(phone ORDER BY created_at DESC NULLS LAST) FILTER (WHERE phone IS NOT NULL AND TRIM(phone) <> ''))[1] AS phone,
    (ARRAY_AGG(email ORDER BY created_at DESC NULLS LAST) FILTER (WHERE email IS NOT NULL AND TRIM(email) <> ''))[1] AS email
  FROM all_parent_rows
  GROUP BY nid
)
INSERT INTO public.parents (national_id, full_name, phone, email)
SELECT nid, full_name, phone, email FROM picked;

-- Link students to parents via slot 1
UPDATE public.students s
SET parent_1_id = p.id
FROM public.parents p
WHERE NULLIF(TRIM(s.parent_national_id), '') = p.national_id;

-- Link students to parents via slot 2
UPDATE public.students s
SET parent_2_id = p.id
FROM public.parents p
WHERE NULLIF(TRIM(s.parent_national_id_2), '') = p.national_id;

-- ============ 4. Sync triggers (temporary, for backward compat) ============
-- When a parent is updated, sync legacy columns on all linked students.
CREATE OR REPLACE FUNCTION public.sync_parent_to_students()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.national_id IS DISTINCT FROM OLD.national_id
     OR NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.phone IS DISTINCT FROM OLD.phone
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.students
    SET parent_national_id = NEW.national_id,
        parent_name = NEW.full_name,
        parent_phone = NEW.phone,
        parent_email = NEW.email
    WHERE parent_1_id = NEW.id;

    UPDATE public.students
    SET parent_national_id_2 = NEW.national_id,
        parent_name_2 = NEW.full_name,
        parent_phone_2 = NEW.phone,
        parent_email_2 = NEW.email
    WHERE parent_2_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_parent_to_students
  AFTER UPDATE ON public.parents
  FOR EACH ROW EXECUTE FUNCTION public.sync_parent_to_students();

-- When a student is inserted/updated with legacy parent_national_id but no parent_1_id/2,
-- auto-create/find parent and link.
CREATE OR REPLACE FUNCTION public.sync_student_to_parents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _nid1 text := NULLIF(TRIM(NEW.parent_national_id), '');
  _nid2 text := NULLIF(TRIM(NEW.parent_national_id_2), '');
  _pid uuid;
BEGIN
  -- Slot 1
  IF _nid1 IS NOT NULL AND NEW.parent_1_id IS NULL THEN
    INSERT INTO public.parents (national_id, full_name, phone, email)
    VALUES (_nid1, NEW.parent_name, NEW.parent_phone, NEW.parent_email)
    ON CONFLICT (national_id) DO UPDATE
      SET full_name = COALESCE(NULLIF(TRIM(EXCLUDED.full_name), ''), public.parents.full_name),
          phone     = COALESCE(NULLIF(TRIM(EXCLUDED.phone), ''),     public.parents.phone),
          email     = COALESCE(NULLIF(TRIM(EXCLUDED.email), ''),     public.parents.email)
    RETURNING id INTO _pid;
    NEW.parent_1_id := _pid;
  END IF;

  -- Slot 2
  IF _nid2 IS NOT NULL AND NEW.parent_2_id IS NULL THEN
    INSERT INTO public.parents (national_id, full_name, phone, email)
    VALUES (_nid2, NEW.parent_name_2, NEW.parent_phone_2, NEW.parent_email_2)
    ON CONFLICT (national_id) DO UPDATE
      SET full_name = COALESCE(NULLIF(TRIM(EXCLUDED.full_name), ''), public.parents.full_name),
          phone     = COALESCE(NULLIF(TRIM(EXCLUDED.phone), ''),     public.parents.phone),
          email     = COALESCE(NULLIF(TRIM(EXCLUDED.email), ''),     public.parents.email)
    RETURNING id INTO _pid;
    NEW.parent_2_id := _pid;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_student_to_parents
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.sync_student_to_parents();
