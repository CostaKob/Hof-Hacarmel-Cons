
ALTER TYPE public.registration_status ADD VALUE IF NOT EXISTS 'waiting_for_call';
ALTER TYPE public.registration_status ADD VALUE IF NOT EXISTS 'waiting_for_payment';
