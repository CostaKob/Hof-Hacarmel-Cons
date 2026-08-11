CREATE TABLE public.short_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  target_url text NOT NULL,
  created_by uuid,
  click_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX short_links_target_url_idx ON public.short_links (target_url);

GRANT SELECT, INSERT ON public.short_links TO authenticated;
GRANT ALL ON public.short_links TO service_role;

ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view short links"
ON public.short_links FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'));

CREATE POLICY "Staff can create short links"
ON public.short_links FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretary'));

CREATE OR REPLACE FUNCTION public.create_short_link(_url text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    _code := lower(substr(replace(replace(encode(gen_random_bytes(9), 'base64'), '/', ''), '+', ''), 1, 7));
    EXIT WHEN length(_code) = 7 AND NOT EXISTS (SELECT 1 FROM public.short_links WHERE code = _code);
  END LOOP;

  INSERT INTO public.short_links (code, target_url, created_by)
  VALUES (_code, _url, auth.uid());

  RETURN _code;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_short_link(_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text;
BEGIN
  UPDATE public.short_links
  SET click_count = click_count + 1
  WHERE code = _code
  RETURNING target_url INTO _url;

  RETURN _url;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_short_link(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_short_link(text) TO anon, authenticated;