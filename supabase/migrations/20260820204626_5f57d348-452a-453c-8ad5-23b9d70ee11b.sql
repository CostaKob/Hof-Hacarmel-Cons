
ALTER TABLE public.calendar_items
  ADD COLUMN IF NOT EXISTS google_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_calendar_id text;

CREATE TABLE IF NOT EXISTS public.google_calendar_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id text NOT NULL,
  sync_token text,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (calendar_id)
);
GRANT SELECT ON public.google_calendar_sync_state TO authenticated;
GRANT ALL ON public.google_calendar_sync_state TO service_role;
ALTER TABLE public.google_calendar_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view sync state"
  ON public.google_calendar_sync_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.calendar_sync_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_event_id text NOT NULL,
  google_calendar_id text,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.calendar_sync_deletions TO authenticated;
GRANT ALL ON public.calendar_sync_deletions TO service_role;
ALTER TABLE public.calendar_sync_deletions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view sync deletions"
  ON public.calendar_sync_deletions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.track_calendar_item_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.google_event_id IS NOT NULL THEN
    INSERT INTO public.calendar_sync_deletions (google_event_id, google_calendar_id)
    VALUES (OLD.google_event_id, OLD.google_calendar_id);
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_calendar_item_deletion ON public.calendar_items;
CREATE TRIGGER trg_track_calendar_item_deletion
  BEFORE DELETE ON public.calendar_items
  FOR EACH ROW EXECUTE FUNCTION public.track_calendar_item_deletion();
