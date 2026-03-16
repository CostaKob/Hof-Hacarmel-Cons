
-- Create school_music_schools table
CREATE TABLE public.school_music_schools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_name TEXT NOT NULL,
  academic_year_id UUID REFERENCES public.academic_years(id),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  coordinator_teacher_id UUID REFERENCES public.teachers(id),
  conductor_teacher_id UUID REFERENCES public.teachers(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create school_music_groups table
CREATE TABLE public.school_music_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_music_school_id UUID NOT NULL REFERENCES public.school_music_schools(id) ON DELETE CASCADE,
  instrument_id UUID NOT NULL REFERENCES public.instruments(id),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.school_music_schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_music_groups ENABLE ROW LEVEL SECURITY;

-- RLS policies for school_music_schools
CREATE POLICY "Admins can manage school_music_schools" ON public.school_music_schools
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for school_music_groups
CREATE POLICY "Admins can manage school_music_groups" ON public.school_music_groups
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
