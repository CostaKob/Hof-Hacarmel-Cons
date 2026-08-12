CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link_path text,
  entity_id uuid,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_created_at ON public.notifications (created_at DESC);

GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view notifications"
ON public.notifications FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own notification reads"
ON public.notification_reads FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users insert their own notification reads"
ON public.notification_reads FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users delete their own notification reads"
ON public.notification_reads FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- helper
CREATE OR REPLACE FUNCTION public.create_notification(
  _type text, _title text, _body text, _link_path text, _entity_id uuid, _year_id uuid
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (type, title, body, link_path, entity_id, academic_year_id)
  VALUES (_type, _title, _body, _link_path, _entity_id, _year_id);
$$;

-- new registration
CREATE OR REPLACE FUNCTION public.notify_new_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.create_notification(
    'registration',
    'הרשמה חדשה: ' || NEW.student_first_name || ' ' || NEW.student_last_name,
    COALESCE(NEW.branch_school_name, '') || CASE WHEN NEW.grade IS NOT NULL AND NEW.grade <> '' THEN ' · כיתה ' || NEW.grade ELSE '' END,
    '/admin/registrations/' || NEW.id::text,
    NEW.id,
    NEW.academic_year_id
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_new_registration
AFTER INSERT ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.notify_new_registration();

-- student payment status
CREATE OR REPLACE FUNCTION public.notify_student_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _name text;
BEGIN
  IF NEW.payment_status IS DISTINCT FROM 'paid' AND NEW.payment_status IS DISTINCT FROM 'failed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.payment_status = NEW.payment_status THEN
    RETURN NEW;
  END IF;

  SELECT first_name || ' ' || last_name INTO _name FROM public.students WHERE id = NEW.student_id;

  IF NEW.payment_status = 'paid' THEN
    PERFORM public.create_notification(
      'payment_paid',
      'התקבל תשלום: ' || COALESCE(_name, 'תלמיד') || ' — ' || to_char(NEW.amount, 'FM999999990.00') || ' ₪',
      NULLIF(NEW.notes, ''),
      CASE WHEN NEW.student_id IS NOT NULL THEN '/admin/students/' || NEW.student_id::text ELSE NULL END,
      NEW.id,
      NEW.academic_year_id
    );
  ELSE
    PERFORM public.create_notification(
      'payment_failed',
      'תשלום נכשל: ' || COALESCE(_name, 'תלמיד') || ' — ' || to_char(NEW.amount, 'FM999999990.00') || ' ₪',
      NULLIF(NEW.notes, ''),
      CASE WHEN NEW.student_id IS NOT NULL THEN '/admin/students/' || NEW.student_id::text ELSE NULL END,
      NEW.id,
      NEW.academic_year_id
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_student_payment
AFTER INSERT OR UPDATE OF payment_status ON public.student_payments
FOR EACH ROW EXECUTE FUNCTION public.notify_student_payment();

-- school music payment
CREATE OR REPLACE FUNCTION public.notify_sm_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _name text;
BEGIN
  IF NEW.payment_status <> 'paid' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.payment_status = NEW.payment_status THEN RETURN NEW; END IF;

  SELECT student_first_name || ' ' || student_last_name INTO _name
  FROM public.school_music_students WHERE id = NEW.school_music_student_id;

  PERFORM public.create_notification(
    'payment_paid',
    'התקבל תשלום (בית ספר מנגן): ' || COALESCE(_name, 'תלמיד') || ' — ' || to_char(NEW.amount, 'FM999999990.00') || ' ₪',
    NULL,
    '/admin/school-music-payments',
    NEW.id,
    NEW.academic_year_id
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_sm_payment
AFTER INSERT OR UPDATE OF payment_status ON public.school_music_payments
FOR EACH ROW EXECUTE FUNCTION public.notify_sm_payment();

-- possible sibling on new student
CREATE OR REPLACE FUNCTION public.notify_sibling_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _match record;
BEGIN
  IF NEW.parent_national_id IS NULL OR NEW.parent_national_id = '' THEN RETURN NEW; END IF;

  SELECT s.id, s.first_name, s.last_name INTO _match
  FROM public.students s
  WHERE s.id <> NEW.id
    AND s.is_active
    AND (s.parent_national_id = NEW.parent_national_id OR s.parent_national_id_2 = NEW.parent_national_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.student_siblings ss
      WHERE (ss.student_a_id = NEW.id AND ss.student_b_id = s.id)
         OR (ss.student_b_id = NEW.id AND ss.student_a_id = s.id)
    )
  LIMIT 1;

  IF _match.id IS NOT NULL THEN
    PERFORM public.create_notification(
      'sibling_candidate',
      'זוהו אחים אפשריים: ' || NEW.first_name || ' ' || NEW.last_name || ' ו' || _match.first_name || ' ' || _match.last_name,
      'ת.ז. הורה זהה — נדרש אישור חיבור',
      '/admin/siblings',
      NEW.id,
      NULL
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_sibling_candidate
AFTER INSERT ON public.students
FOR EACH ROW EXECUTE FUNCTION public.notify_sibling_candidate();