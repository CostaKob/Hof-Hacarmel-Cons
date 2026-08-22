CREATE OR REPLACE FUNCTION public.notify_calendar_change_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action_he text;
  _title text;
BEGIN
  _action_he := CASE NEW.action
    WHEN 'create' THEN 'הוספת אירוע'
    WHEN 'update' THEN 'עריכת אירוע'
    WHEN 'delete' THEN 'מחיקת אירוע'
    ELSE 'שינוי'
  END;

  _title := COALESCE(NULLIF(NEW.payload->>'title_he', ''), NULLIF(NEW.snapshot->>'title_he', ''), 'אירוע');

  PERFORM public.create_notification(
    'calendar_change_request',
    'בקשת שינוי בלוח השנה',
    COALESCE(NEW.requested_by_name, 'רכז') || ' ביקש/ה ' || _action_he || ': ' || _title,
    '/admin/year-calendar',
    NEW.id,
    NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_calendar_change_request ON public.calendar_change_requests;
CREATE TRIGGER trg_notify_calendar_change_request
AFTER INSERT ON public.calendar_change_requests
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION public.notify_calendar_change_request();