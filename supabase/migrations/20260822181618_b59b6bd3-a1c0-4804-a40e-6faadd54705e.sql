DROP POLICY IF EXISTS "Allow authenticated full access to calendar_items" ON public.calendar_items;
DROP POLICY IF EXISTS "Allow authenticated full access to tracks" ON public.tracks;
DROP POLICY IF EXISTS "Allow authenticated full access to branches" ON public.branches;
DROP POLICY IF EXISTS "Allow authenticated full access to people" ON public.people;

CREATE POLICY "Authenticated can view calendar_items" ON public.calendar_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage calendar_items" ON public.calendar_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view tracks" ON public.tracks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage tracks" ON public.tracks FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view branches" ON public.branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage branches" ON public.branches FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view people" ON public.people FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage people" ON public.people FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));