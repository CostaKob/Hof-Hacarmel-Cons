CREATE OR REPLACE FUNCTION public.is_sm_coordinator(_user_id uuid, _school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_music_schools s
    WHERE s.id = _school_id
      AND s.coordinator_teacher_id = public.get_teacher_id_for_user(_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_sm_coordinator_of_class(_user_id uuid, _class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_music_classes c
    JOIN public.school_music_schools s ON s.id = c.school_music_school_id
    WHERE c.id = _class_id
      AND s.coordinator_teacher_id = public.get_teacher_id_for_user(_user_id)
  );
$$;

-- Classes
CREATE POLICY "Coordinators can manage their school classes"
ON public.school_music_classes
FOR ALL
TO authenticated
USING (public.is_sm_coordinator(auth.uid(), school_music_school_id))
WITH CHECK (public.is_sm_coordinator(auth.uid(), school_music_school_id));

-- Class groups
CREATE POLICY "Coordinators can manage their school class groups"
ON public.school_music_class_groups
FOR ALL
TO authenticated
USING (public.is_sm_coordinator_of_class(auth.uid(), school_music_class_id))
WITH CHECK (public.is_sm_coordinator_of_class(auth.uid(), school_music_class_id));

-- Students
CREATE POLICY "Coordinators can manage their school students"
ON public.school_music_students
FOR ALL
TO authenticated
USING (public.is_sm_coordinator(auth.uid(), school_music_school_id))
WITH CHECK (public.is_sm_coordinator(auth.uid(), school_music_school_id));

-- School details (update only, protected columns enforced by trigger)
CREATE POLICY "Coordinators can update their school"
ON public.school_music_schools
FOR UPDATE
TO authenticated
USING (public.is_sm_coordinator(auth.uid(), id))
WITH CHECK (public.is_sm_coordinator(auth.uid(), id));

CREATE OR REPLACE FUNCTION public.protect_sm_school_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.annual_tuition_fee IS DISTINCT FROM OLD.annual_tuition_fee
     OR NEW.coordinator_teacher_id IS DISTINCT FROM OLD.coordinator_teacher_id
     OR NEW.conductor_teacher_id IS DISTINCT FROM OLD.conductor_teacher_id
     OR NEW.coordinator_hours IS DISTINCT FROM OLD.coordinator_hours
     OR NEW.conductor_hours IS DISTINCT FROM OLD.conductor_hours
     OR NEW.icount_payment_page_url IS DISTINCT FROM OLD.icount_payment_page_url
     OR NEW.academic_year_id IS DISTINCT FROM OLD.academic_year_id
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'אין הרשאה לעדכן שדות ניהוליים בבית הספר' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_sm_school_admin_fields_trg ON public.school_music_schools;
CREATE TRIGGER protect_sm_school_admin_fields_trg
BEFORE UPDATE ON public.school_music_schools
FOR EACH ROW EXECUTE FUNCTION public.protect_sm_school_admin_fields();