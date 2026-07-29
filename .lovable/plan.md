
# מעבר לטבלת `parents` — מקור אמת אחד להורים

## המטרה
היום פרטי ההורה משוכפלים בכל רשומת תלמיד (8 עמודות `parent_*`). המבנה הזה גורם לסחיפות (אותו הורה עם 3 שמות שונים), עדכונים ידניים ידניים, ו"איחוד" שבור. אנחנו עוברים לישות `parents` נורמלית עם FK, כך שעדכון אחד = כל הילדים מתעדכנים אוטומטית לנצח.

## סכימה חדשה

```text
parents
├── id (uuid, PK)
├── national_id (text, UNIQUE, NOT NULL)     ← המפתח הלוגי
├── full_name (text)
├── phone (text)
├── email (text)
└── created_at / updated_at

students (עמודות חדשות)
├── parent_1_id (uuid, FK → parents.id, nullable)
└── parent_2_id (uuid, FK → parents.id, nullable)
```

**מדיניות:** אין CASCADE DELETE — הורה לא נמחק כשילד נמחק, ולהיפך. ניקוי הורים "יתומים" יטופל בנפרד (ראה שלב 4).

## שלבי הגירה (בטוח, בלי downtime)

### שלב 1 — יצירת הטבלה + הגירת נתונים
מיגרציה אחת:
1. `CREATE TABLE parents` + GRANTs + RLS (admin/secretary CRUD מלא, teacher SELECT בסיסי).
2. `ALTER TABLE students ADD COLUMN parent_1_id / parent_2_id`.
3. שאילתת הגירה: לכל `parent_national_id` ייחודי ב-`students` (מ-8 השדות ב-4 הצירופים) — יוצרים שורה ב-`parents` עם השם/טלפון/מייל **המעודכן ביותר** (לפי `created_at DESC`), ומקשרים חזרה ב-`parent_1_id` / `parent_2_id`.
4. השדות הישנים (`parent_national_id`, `parent_name`, וכו') **נשארים** כרגע — לתאימות אחורה של קוד קיים.

### שלב 2 — סנכרון אוטומטי
טריגר על `parents` (AFTER UPDATE) שמעדכן גם את השדות הישנים ב-`students` המקושרים. ככה כל קוד קיים שקורא מ-`parent_name` על תלמיד ממשיך לעבוד בזמן שאני מעדכן את הקומפוננטות אחת אחת.

טריגר הפוך על `students`: אם `parent_1_id` מוגדר, למלא אוטומטית את `parent_national_id`/`parent_name`/וכו' מהטבלה החדשה.

### שלב 3 — עדכון RPCs וקוד
- `list_families` — לקרוא ישירות מ-`parents` (עם `LEFT JOIN` ל-`students`). הרבה יותר פשוט ומהיר.
- `get_sibling_candidates` — לזהות אחים לפי `parent_1_id` / `parent_2_id` משותפים במקום השוואת מחרוזות ת.ז.
- `useFamilies.ts`, `AdminFamilyCard.tsx`, `UnifyParentDetailsDialog.tsx` — לעבוד מול `parents`.
- טופס תלמיד (`AdminStudentForm.tsx`): כשמזינים ת.ז. הורה — חיפוש אוטומטי ב-`parents`; קיים → קישור אוטומטי; לא קיים → יצירה. אין יותר הקלדה חופשית של אותם פרטים.
- טופס הרשמה ציבורי (`PublicRegistration.tsx`) + `AdminRegistrationConvert.tsx`: אותה לוגיקה — הת.ז. יוצרת/מוצאת הורה.

### שלב 4 — ניקוי (מיגרציה נפרדת, אחרי אימות)
אחרי שהכל עובד ב-production כמה ימים:
- להסיר את הטריגרים של הסנכרון.
- להסיר את העמודות הישנות `parent_national_id`, `parent_name`, `parent_phone`, `parent_email` (ו-`_2`) מ-`students`.
- למחוק הורים ללא ילדים.

## אזורי קוד שיושפעו (עדכון)
- `src/hooks/useFamilies.ts`, `src/pages/admin/AdminFamilies.tsx`, `src/pages/admin/AdminFamilyCard.tsx`
- `src/components/admin/UnifyParentDetailsDialog.tsx` → יהפוך לעריכת שורת `parents` בודדת
- `src/pages/admin/AdminStudentForm.tsx`, `src/pages/admin/AdminRegistrationConvert.tsx`
- `src/pages/PublicRegistration.tsx`
- `src/pages/admin/AdminBulkMessage.tsx` (חילוץ נמענים לפי `parents`)
- RPCs: `list_families`, `get_sibling_candidates`, `lookup_student_by_national_id`
- Edge functions ש-ingest'ות טפסים

## מה שנשאר זהה
- טבלת `student_siblings` נשארת (כרגע לזיהוי אחים לא־ביולוגיים / מקרי קצה); אחרי המעבר נוכל להוריד את המנגנון האוטומטי כי אחים מזוהים מיידית דרך FK משותף.
- כל התשלומים, ההנחות, ההרשמות — בלי שינוי.

## סיכונים ואיך מטפלים
1. **הגירה של רשומות עם ת.ז. שגוי/חסר** → נשארים ללא `parent_1_id`; מסך אדמין יסמן אותם ("תלמידים ללא הורה מקושר") להשלמה ידנית.
2. **שני הורים עם אותה ת.ז. בשני ילדים שונים אבל שם/טלפון שונה** → נלקח האחרון; כאמור, מסך האיחוד שכבר בנוי משאיר אפשרות תיקון.
3. **קוד ישן שלא הוסב** → הטריגרים בשלב 2 שומרים על תאימות עד שהכל מוסב.

## מה אני צריך ממך לפני שאתחיל
- אישור לגישה הזו (3 שלבים + ניקוי בהמשך).
- אישור שהורה = ת.ז. ייחודית גלובלית (שני ילדים עם אותה ת.ז. הורה = אותו הורה). אני מניח שכן.

עם אישור, אני מתחיל משלב 1 (מיגרציה + הגירת נתונים) — זה יהיה קול לאישור מיגרציה נפרד.
