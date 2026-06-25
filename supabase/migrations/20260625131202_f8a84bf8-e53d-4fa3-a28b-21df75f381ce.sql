
WITH base AS (
  SELECT p.id AS page_id,
         COALESCE(
           (SELECT sort_order FROM public.registration_page_fields f
            WHERE f.page_id = p.id AND f.field_key = 'requested_lesson_duration'
            ORDER BY sort_order LIMIT 1),
           (SELECT COALESCE(MAX(sort_order), 0) FROM public.registration_page_fields f WHERE f.page_id = p.id)
         ) AS anchor
  FROM public.registration_pages p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.registration_page_fields x
    WHERE x.page_id = p.id AND x.field_key IN ('wants_music_production','wants_recital_track')
  )
), bumped AS (
  UPDATE public.registration_page_fields f
  SET sort_order = sort_order + 2
  FROM base
  WHERE f.page_id = base.page_id AND f.sort_order > base.anchor
  RETURNING 1
)
INSERT INTO public.registration_page_fields
  (page_id, field_key, label, field_type, is_required, options, sort_order, is_active, help_text, section_title, placeholder, data_source)
SELECT b.page_id, v.field_key, v.label, 'checkbox', false, '[]'::jsonb,
       b.anchor + v.off, true, v.help_text, v.section_title, v.placeholder, ''
FROM base b
CROSS JOIN (VALUES
  ('wants_music_production','קורס הפקה מוסיקלית','מיועד לכיתות ז׳ עד בוגר','קורסים מיוחדים','סמנו אם ברצונכם להירשם לקורסים מיוחדים בנוסף לשיעור הרגיל. המחיר יתווסף לחיוב השנתי.',1),
  ('wants_recital_track','מסלול לרסיטל','מיועד לכיתה י״ב בלבד','','',2)
) AS v(field_key,label,help_text,section_title,placeholder,off);
