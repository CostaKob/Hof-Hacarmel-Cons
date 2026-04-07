CREATE POLICY "Anon can view school_music_groups"
ON public.school_music_groups
FOR SELECT
TO anon
USING (true);