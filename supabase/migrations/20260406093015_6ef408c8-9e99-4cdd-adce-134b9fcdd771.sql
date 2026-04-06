CREATE POLICY "Anon can view active school_music_schools"
ON public.school_music_schools
FOR SELECT
TO anon
USING (is_active = true);