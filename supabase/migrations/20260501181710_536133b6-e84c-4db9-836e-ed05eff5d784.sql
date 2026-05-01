
CREATE TABLE public.cities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage cities"
ON public.cities
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anon can view cities"
ON public.cities
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Authenticated can view cities"
ON public.cities
FOR SELECT
TO authenticated
USING (true);

INSERT INTO public.cities (name, sort_order) VALUES
  ('בית אורן', 10),
  ('בית חנניה', 20),
  ('בת שלמה', 30),
  ('גבע כרמל', 40),
  ('דור', 50),
  ('הבונים', 60),
  ('החותרים', 70),
  ('ימין אורד', 80),
  ('כפר גלים', 90),
  ('כפר צבי סיטרין', 100),
  ('כרם מהר"ל', 110),
  ('מגדים', 120),
  ('מעגן מיכאל', 130),
  ('מעין צבי', 140),
  ('נווה ים', 150),
  ('נחשולים', 160),
  ('ניר עציון', 170),
  ('עופר', 180),
  ('עין אילה', 190),
  ('עין הוד', 200),
  ('עין חוד', 210),
  ('עין כרמל', 220),
  ('עתלית', 230),
  ('צרופה', 240),
  ('קיסריה', 250),
  ('שדות ים', 260),
  ('מאיר שפיה', 270),
  ('פרדס חנה-כרכור', 280),
  ('בנימינה', 290),
  ('זכרון יעקב', 300);
