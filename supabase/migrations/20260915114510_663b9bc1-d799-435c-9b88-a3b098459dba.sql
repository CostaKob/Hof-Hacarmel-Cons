CREATE TABLE public.salary_month_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key text NOT NULL,
  scope text NOT NULL DEFAULT 'employees',
  status text NOT NULL DEFAULT 'draft',
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  closed_at timestamptz,
  closed_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (month_key, scope)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_month_snapshots TO authenticated;
GRANT ALL ON public.salary_month_snapshots TO service_role;

ALTER TABLE public.salary_month_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view salary snapshots"
ON public.salary_month_snapshots FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Admins can manage salary snapshots"
ON public.salary_month_snapshots FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER salary_month_snapshots_updated_at
BEFORE UPDATE ON public.salary_month_snapshots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.salary_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key text NOT NULL,
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  teacher_name text,
  field text NOT NULL,
  old_value numeric,
  new_value numeric,
  action text NOT NULL DEFAULT 'edit',
  changed_by uuid,
  changed_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX salary_audit_log_month_idx ON public.salary_audit_log (month_key, created_at DESC);

GRANT SELECT, INSERT ON public.salary_audit_log TO authenticated;
GRANT ALL ON public.salary_audit_log TO service_role;

ALTER TABLE public.salary_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view salary audit log"
ON public.salary_audit_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Admins can insert salary audit log"
ON public.salary_audit_log FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));