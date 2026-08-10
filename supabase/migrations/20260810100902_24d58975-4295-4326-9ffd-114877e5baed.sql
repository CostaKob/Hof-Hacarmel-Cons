CREATE TABLE public.refund_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES public.student_payments(id) ON DELETE SET NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  doc_type text NOT NULL DEFAULT 'bank_transfer_letter',
  title text NOT NULL,
  parent_name text,
  refund_amount numeric,
  bank_reference text,
  content_text text,
  content_html text,
  file_path text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refund_documents TO authenticated;
GRANT ALL ON public.refund_documents TO service_role;

ALTER TABLE public.refund_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view refund documents"
ON public.refund_documents FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Staff can create refund documents"
ON public.refund_documents FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Staff can delete refund documents"
ON public.refund_documents FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'));

CREATE INDEX idx_refund_documents_payment ON public.refund_documents(payment_id);
CREATE INDEX idx_refund_documents_student ON public.refund_documents(student_id);