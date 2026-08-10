CREATE POLICY "Staff can read refund documents files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'refund-documents' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary')));

CREATE POLICY "Staff can upload refund documents files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'refund-documents' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary')));

CREATE POLICY "Staff can delete refund documents files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'refund-documents' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary')));