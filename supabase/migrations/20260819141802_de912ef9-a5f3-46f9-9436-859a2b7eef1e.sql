CREATE TABLE public.cheque_cancellation_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  academic_year_id UUID REFERENCES public.academic_years(id),
  student_id UUID REFERENCES public.students(id),
  family_parent_national_id TEXT,
  parent_name TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting_cheques',
  cheques_total NUMERIC NOT NULL DEFAULT 0,
  credit_due NUMERIC NOT NULL DEFAULT 0,
  refund_amount NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  requested_by UUID,
  cheques_received_at DATE,
  transfer_requested_at DATE,
  transfer_confirmed_at DATE,
  transfer_reference TEXT,
  withdrawal_letter_id UUID REFERENCES public.refund_documents(id),
  transfer_letter_id UUID REFERENCES public.refund_documents(id),
  credit_payment_id UUID REFERENCES public.student_payments(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.cheque_cancellation_request_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.cheque_cancellation_requests(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES public.student_payments(id) ON DELETE SET NULL,
  cheque_number TEXT,
  bank TEXT,
  branch TEXT,
  account TEXT,
  due_date DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cheque_cancellation_requests TO authenticated;
GRANT ALL ON public.cheque_cancellation_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cheque_cancellation_request_items TO authenticated;
GRANT ALL ON public.cheque_cancellation_request_items TO service_role;

ALTER TABLE public.cheque_cancellation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheque_cancellation_request_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and secretaries manage cheque cancellation requests"
ON public.cheque_cancellation_requests FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Admins and secretaries manage cheque cancellation items"
ON public.cheque_cancellation_request_items FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'));

CREATE INDEX idx_ccr_family ON public.cheque_cancellation_requests(family_parent_national_id);
CREATE INDEX idx_ccr_student ON public.cheque_cancellation_requests(student_id);
CREATE INDEX idx_ccr_items_request ON public.cheque_cancellation_request_items(request_id);

CREATE TRIGGER update_cheque_cancellation_requests_updated_at
BEFORE UPDATE ON public.cheque_cancellation_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();