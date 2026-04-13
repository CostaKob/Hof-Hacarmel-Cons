
CREATE POLICY "Anon can view school_music_classes"
ON public.school_music_classes
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Anon can view school_music_class_groups"
ON public.school_music_class_groups
FOR SELECT
TO anon
USING (true);
