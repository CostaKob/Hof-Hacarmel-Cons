
-- Enum for instrument condition
CREATE TYPE public.instrument_condition AS ENUM ('available', 'loaned', 'in_repair', 'unusable');

-- Storage locations (managed list like cities)
CREATE TABLE public.instrument_storage_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instrument_storage_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage instrument_storage_locations"
  ON public.instrument_storage_locations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view instrument_storage_locations"
  ON public.instrument_storage_locations FOR SELECT TO authenticated
  USING (true);

-- Inventory instruments
CREATE TABLE public.inventory_instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID NOT NULL REFERENCES public.instruments(id),
  serial_number TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  condition instrument_condition NOT NULL DEFAULT 'available',
  storage_location_id UUID REFERENCES public.instrument_storage_locations(id),
  purchase_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instrument_id, serial_number)
);

ALTER TABLE public.inventory_instruments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage inventory_instruments"
  ON public.inventory_instruments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can view inventory_instruments"
  ON public.inventory_instruments FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'teacher'));

CREATE POLICY "Secretaries can view inventory_instruments"
  ON public.inventory_instruments FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'secretary'));

CREATE TRIGGER update_inventory_instruments_updated_at
  BEFORE UPDATE ON public.inventory_instruments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Instrument loans (history)
CREATE TABLE public.instrument_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_instrument_id UUID NOT NULL REFERENCES public.inventory_instruments(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  school_music_student_id UUID REFERENCES public.school_music_students(id) ON DELETE SET NULL,
  loan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  return_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT loan_has_one_student CHECK (
    (student_id IS NOT NULL AND school_music_student_id IS NULL) OR
    (student_id IS NULL AND school_music_student_id IS NOT NULL)
  )
);

ALTER TABLE public.instrument_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage instrument_loans"
  ON public.instrument_loans FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can view loans for their students"
  ON public.instrument_loans FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT e.student_id FROM enrollments e
      WHERE e.teacher_id = get_teacher_id_for_user(auth.uid())
    )
  );

CREATE POLICY "Secretaries can view instrument_loans"
  ON public.instrument_loans FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'secretary'));
