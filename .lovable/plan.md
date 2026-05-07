# תשתית מודול תשלומים - תוכנית מפורטת

מודול חישוב תשלומים שלם עם הכנה לחיבור עתידי ל-iCount API. זו עבודה גדולה - אני מציע תוכנית בשלבים, כדי שתאשר/תכוון לפני שאני בונה.

## הערה חשובה לפני שמתחילים

יש כבר במערכת לוגיקת תשלומים קיימת (`student_payments`, `AddPaymentDialog`, "Admin Student Card" עם enrollments + payments + credits). הפיצ'ר החדש שונה: הוא לא רישום ידני של תשלומים בודדים - אלא **מחשבון שכר לימוד שנתי עם הנחות** + הכנה ל-iCount.

לפני שאני בונה דברים מקבילים - חשוב להחליט:

### שאלות קריטיות:

1. **מחירון**: בסכמה הקיימת `enrollments.price_per_lesson` כבר קיים פר-רישום. האם להוסיף **מחירון גלובלי לפי משך שיעור** (30/45/60 דק') בנוסף, או להמשיך להשתמש במחיר פר-enrollment הקיים?

2. **תאריכי שנת לימודים**: כבר קיים `academic_years` עם `start_date`/`end_date`. נשתמש בו (לא ניצור טבלה חדשה), נכון?

3. **הנחות**: לאחסן בטבלת `payment_settings` חדשה (אחת גלובלית) או כעמודות ב-`academic_years`? + האם הסטטוס "תלמיד מגמה" כבר נגזר ממקום קיים (playing_level?) או צריך עמודה חדשה ב-students?

4. **"כבר שולם"**: יש כבר חישוב `paid` דינמי מ-`student_payments`. האם החדש יציג את הסכום הקיים (קריאה בלבד) או יאפשר override ידני?

## תוכנית מוצעת

### שלב 1 - סכמה
- טבלה `payment_settings` (singleton): `vat_rate`, `lesson_prices` (jsonb: `{"30":X, "45":Y, "60":Z}`), `discount_sibling`, `discount_second_instrument`, `discount_major_student`
- עמודה `is_major_student` ב-`students` (boolean)
- RLS: admin manages, secretary/teacher view

### שלב 2 - דף הגדרות מנהל
`/admin/payment-settings` עם טופס למחירון, מע"מ 18%, אחוזי הנחות

### שלב 3 - מחשבון תשלום
- כפתור "חשב תשלום" ב-`AdminStudentCard`
- עמוד חדש `/admin/students/:id/calculate-payment`:
  - ראש: פרטי תלמיד + הורים (קריאה בלבד מהקיים)
  - רשימת enrollments פעילים עם מורה/כלי/משך/סניף/תאריך
  - צ'קבוקסים: אח שני, כלי שני, מגמה + הנחה מותאמת (label+%)
  - חישוב פרו-ראטה: `(annual_price/12) × months_remaining_to_year_end`
  - סיכום: בסיס שנתי, פרו-ראטה, אחרי הנחות, "כבר שולם" (מ-payments הקיים), יתרה
  - כולל הצגת מע"מ 18%

### שלב 4 - תשתית iCount (placeholder בלבד)
- כפתור "צור קישור לתשלום" → קורא ל-edge function `generate-icount-link`
- הפונקציה: בונה payload (פרטי הורה, שורות חיוב, מע"מ 18%, סכום), מדפיסה ל-console, מחזירה `{ ready: true }`
- Toast: "התשתית מוכנה - הקישור ייווצר כשiCount יחובר"
- Edge function `icount-webhook` (verify_jwt=false): כרגע רק לוג + 200 OK, מוכן לעדכן `is_paid`+`amount_paid` בעתיד

### שלב 5 - עיצוב
RTL מלא, shadcn/ui, פלטת ירוק זית הקיימת, h-12/h-11/rounded-xl לפי הסטנדרט.

## מה אני צריך ממך
תענה על 4 השאלות למעלה (ולו במשפט קצר לכל אחת), ואני יוצא לדרך עם שלב 1 (מיגרציה).
