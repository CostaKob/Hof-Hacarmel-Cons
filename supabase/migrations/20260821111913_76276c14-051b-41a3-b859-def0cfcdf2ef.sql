UPDATE public.calendar_items c
SET end_time = (c.start_time + interval '2 hours')::time
FROM public.tracks t
WHERE c.track_id = t.id
  AND t.key <> 'availability'
  AND c.start_time IS NOT NULL;