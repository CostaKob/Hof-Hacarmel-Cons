
ALTER TABLE public.school_music_students
  ADD COLUMN school_music_class_id uuid REFERENCES public.school_music_classes(id),
  ADD COLUMN school_music_class_group_id uuid REFERENCES public.school_music_class_groups(id);
