ALTER TABLE public.calendar_items
  ADD COLUMN IF NOT EXISTS start_time time without time zone,
  ADD COLUMN IF NOT EXISTS location_he text;

-- אירוע רגיל (ברירת מחדל, ללא צבע)
UPDATE public.tracks
   SET key = 'regular', label_he = 'אירוע רגיל', sort_order = 1, is_continuous = false
 WHERE key = 'branch_events';

-- חופש (ירוק)
UPDATE public.tracks
   SET key = 'vacation', label_he = 'חופש', sort_order = 2, is_continuous = false
 WHERE key = 'holidays';

-- יום הזיכרון (כחול)
INSERT INTO public.tracks (key, label_he, sort_order, is_continuous)
VALUES ('memorial', 'יום הזיכרון', 3, false)
ON CONFLICT (key) DO UPDATE
   SET label_he = EXCLUDED.label_he,
       sort_order = EXCLUDED.sort_order,
       is_continuous = EXCLUDED.is_continuous;

-- העברת אירועי "הערות" לאירוע רגיל וביטול המסלול
UPDATE public.calendar_items
   SET track_id = (SELECT id FROM public.tracks WHERE key = 'regular')
 WHERE track_id IN (SELECT id FROM public.tracks WHERE key = 'notes');

DELETE FROM public.tracks WHERE key = 'notes';

-- זמינות תמיד אחרונה
UPDATE public.tracks
   SET label_he = 'זמינות', sort_order = 99, is_continuous = true
 WHERE key = 'availability';