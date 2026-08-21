UPDATE public.calendar_items ci
SET start_time = CASE WHEN ci.title_he ILIKE '%חלוקת כלים%' OR ci.title_he ILIKE '%חלוקות כלים%' THEN TIME '17:00' ELSE TIME '10:00' END,
    end_time = CASE WHEN ci.title_he ILIKE '%חלוקת כלים%' OR ci.title_he ILIKE '%חלוקות כלים%' THEN TIME '19:00' ELSE TIME '12:00' END,
    updated_at = now()
FROM public.tracks t
WHERE t.id = ci.track_id
  AND t.key = 'regular'
  AND ci.start_time IS NULL;