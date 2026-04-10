
ALTER TABLE public.registrations
ADD COLUMN registration_token text UNIQUE;

CREATE INDEX idx_registrations_token ON public.registrations (registration_token) WHERE registration_token IS NOT NULL;
