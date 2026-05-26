## המטרה
כל הרשמה יוצרת Paypage דינמי ב-iCount עם שם הילד בעגלה. ברגע שההורה משלם — ה-Paypage נמחק אוטומטית מהרשימה ב-iCount. רשימת ה-Paypages תכיל רק תלמידים שעדיין לא שילמו (= "מי שחייב"). קבלות, חשבוניות וזיכויים לא מושפעים — הם מסמכים נפרדים ונשארים שלמים.

## שינויים בקוד

### 1. `supabase/functions/icount-sm-payment-webhook/index.ts`
אחרי שהתשלום מסומן כ-`paid` ב-DB:
- לחלץ את ה-Paypage ID מתוך `payment.payment_link_url` (regex: `app.icount.co.il/m/([a-z0-9]+)/`).
- לקרוא ל-iCount API: `POST /paypage/delete` עם `{ cid, user, pass, paypage_id }`.
- אם המחיקה נכשלת — לא להפיל את ה-webhook (רק log warn). התשלום כבר נרשם, המחיקה היא ניקיון בלבד.
- לאפס `payment_link_url` ב-DB אחרי מחיקה מוצלחת (כדי שלא ננסה להשתמש בקישור מת).

### 2. `supabase/functions/icount-generate-paylink/index.ts`
- כיום: אם יש `payment_link_url` ב-DB → מחזיר אותו (אחרי החלפת query params).
- שינוי: לפני שמחזירים URL קיים, לוודא שה-`payment_status` עדיין `pending`. אם הוא `paid` או `failed` — להתעלם מה-URL הקיים וליצור חדש (מקרה קצה: בקשת קישור אחרי שכבר שולם).
- אם אין `payment_link_url` → ליצור Paypage חדש (כמו היום).

### 3. החזרים — ללא שינוי
פלואו ההחזרים הקיים (`icount-create-sm-refund`) עובד על `icount_doc_id` של הקבלה. הקבלה היא ישות נפרדת ב-iCount ולא מושפעת ממחיקת ה-Paypage. החזרים מלאים/חלקיים ימשיכו לעבוד כרגיל.

## טכני
- iCount API למחיקת Paypage: `POST https://api.icount.co.il/api/v3.php/paypage/delete` עם body `{ cid, user, pass, paypage_id }`. הסודות `ICOUNT_COMPANY_ID`, `ICOUNT_USERNAME`, `ICOUNT_PASSWORD` כבר קיימים.
- אם iCount מחזיר 404 על paypage שכבר נמחק — להתייחס כ-success (לא לזרוק שגיאה).

## תוצאה למשתמש
- **רשימת Paypages ב-iCount:** רק תלמידים שעדיין לא שילמו → לראות במבט אחד מי חייב.
- **רשימת מסמכים ב-iCount:** כל הקבלות והזיכויים נשמרים לנצח, ללא שינוי.
- **החזרים:** עובדים כרגיל (מלא/חלקי) על בסיס הקבלה.
- **חוויית ההורה:** ללא שינוי — שם הילד בעגלה, מילוי אוטומטי של פרטי הורה.
