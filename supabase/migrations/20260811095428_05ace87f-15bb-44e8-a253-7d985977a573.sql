CREATE OR REPLACE FUNCTION public.create_short_link(_url text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _code text;
  _existing text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _url IS NULL OR _url !~* '^https://' THEN
    RAISE EXCEPTION 'only https urls are allowed';
  END IF;

  SELECT code INTO _existing FROM public.short_links WHERE target_url = _url LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  LOOP
    _code := substr(md5(random()::text || clock_timestamp()::text), 1, 7);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.short_links WHERE code = _code);
  END LOOP;

  INSERT INTO public.short_links (code, target_url, created_by)
  VALUES (_code, _url, auth.uid());

  RETURN _code;
END;
$function$;