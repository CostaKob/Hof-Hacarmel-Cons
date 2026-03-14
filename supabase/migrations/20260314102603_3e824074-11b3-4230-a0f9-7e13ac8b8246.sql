
-- Create storage bucket for app settings (logo, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('app-settings', 'app-settings', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated admins to upload/update/delete files
CREATE POLICY "Admins can manage app-settings files"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'app-settings' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'app-settings' AND public.has_role(auth.uid(), 'admin'));

-- Allow anyone to read (public logo)
CREATE POLICY "Anyone can view app-settings files"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'app-settings');
