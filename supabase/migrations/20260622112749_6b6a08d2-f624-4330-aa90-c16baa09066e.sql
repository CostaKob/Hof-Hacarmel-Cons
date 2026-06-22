
CREATE OR REPLACE FUNCTION public.get_public_pricing()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'lesson_prices', COALESCE((SELECT lesson_prices FROM public.payment_settings LIMIT 1), '{}'::jsonb),
    'vat_rate', COALESCE((SELECT vat_rate FROM public.payment_settings LIMIT 1), 0),
    'music_production_price', (SELECT music_production_price FROM public.payment_settings LIMIT 1),
    'recital_track_price', (SELECT recital_track_price FROM public.payment_settings LIMIT 1),
    'discounts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('label', label, 'percentage', percentage) ORDER BY sort_order)
      FROM public.discount_types
      WHERE is_active = true
        AND academic_year_id = (SELECT id FROM public.academic_years WHERE is_active = true LIMIT 1)
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_public_pricing() TO anon, authenticated;
