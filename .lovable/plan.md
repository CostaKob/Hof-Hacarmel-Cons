
## מטרה
לאחר שההורה לוחץ "שלח טופס" בטופס ההרשמה לבית הספר המנגן, התלמיד יישובץ מיד לקבוצה, יוצג מסך אישור עם פרטי השיבוץ והכלי, ומשם ההורה יועבר ישירות לדף תשלום של iCount עבור דמי הלימוד השנתיים. עם אישור התשלום — שורת התשלום בכרטיס התלמיד תתעדכן אוטומטית ל"שולם" עם קישור לקבלה.

## זרימה מקצה לקצה

```text
[הורה ממלא טופס]
       │
       ▼
[Submit] ─► RPC register_school_music_student_with_loan
                │ יוצר תלמיד + שיבוץ + השאלת כלי (קיים)
                │ + יוצר school_music_payments (status=pending, amount=annual_tuition_fee)
                ▼
[מסך אישור שיבוץ] — שם תלמיד, בית ספר, כיתה, מורה, כלי + סכום לתשלום
                │ "המשך לתשלום" / "אשלם בהמשך"
                ▼
[Edge Function: icount-create-sm-payment-link]
                │ יוצר ב-iCount "דף תשלום" עבור payment_id, מחזיר URL
                ▼
[Redirect ל-iCount Hosted Payment Page]
                ▼
[הורה משלם] ──► iCount Webhook ──► [Edge Function: icount-sm-payment-webhook]
                                     │ מעדכן payment: status=paid, paid_at, doc_id, doc_number, invoice_url
                                     │ מפיק קבלה אוטומטית (או iCount מפיק)
                                     ▼
[Redirect חזרה לאפליקציה: /school-music/register/success?payment=ok]
                ▼
[מסך תודה — קישור להורדת קבלה]
```

## שינויי DB

מיגרציה חדשה:
- הוספת עמודה `icount_payment_page_id text` ל-`school_music_payments` (מזהה דף התשלום שנוצר).
- הוספת עמודה `payment_link_url text` ל-`school_music_payments` (ה-URL שאליו ההורה הופנה).
- אינדקס על `school_music_student_id` ל-`school_music_payments` לביצועים.
- שינוי ה-RPC הקיים `register_school_music_student_with_loan`: בסיומו תיווצר גם שורת `school_music_payments` עם `payment_status='pending'`, `amount = school.annual_tuition_fee`, וקישור ל-academic_year_id ו-school_id המתאימים. ה-RPC יחזיר את ה-payment_id בנוסף ל-student_id (יחזור אובייקט JSON במקום uuid).

## Edge Functions

### 1. `icount-create-sm-payment-link` (חדש)
- קלט: `{ paymentId }`.
- שולף את ה-payment + פרטי התלמיד/הורה + בית הספר.
- קורא ל-iCount API `payment_page/create` (או `doc/create` עם `doc_type=invrec` + `cc_charge=1` כדי לקבל לינק) עם:
  - סכום = `payment.amount`
  - פרטי לקוח: שם הורה, ת"ז הורה, אימייל, טלפון
  - תיאור: "דמי לימוד בית הספר המנגן — {school_name} — {student_name} — {year_name}"
  - `success_url` ו-`cancel_url` חזרה לאפליקציה
  - `custom = payment_id` כדי לשייך בקבלה ב-webhook
- שומר את `payment_link_url` ו-`icount_payment_page_id` ברשומה.
- מחזיר `{ url }`.

### 2. `icount-sm-payment-webhook` (חדש)
- מקבל POST מ-iCount כשהתשלום מסתיים (success/fail).
- מאתר את ה-payment לפי `custom` / `icount_payment_page_id`.
- מעדכן: `payment_status='paid'`, `paid_at=now()`, `payment_method='credit_card'`, `transaction_reference`, `icount_doc_id`, `icount_doc_number`, `invoice_url`.
- מחזיר 200 ל-iCount.
- ה-URL של ה-webhook יוגדר בלוח הבקרה של iCount (פעולה ידנית של המשתמש פעם אחת — אפרט בהמשך).

הפונקציה הקיימת `icount-create-sm-receipt` נשארת לשימוש האדמין הידני (תשלום במזומן/צ'ק וכו').

## שינויים בצד הלקוח

### `src/pages/SchoolMusicRegister.tsx`
- אחרי קריאת ה-RPC המוצלחת, להחליף את הודעת ההצלחה הנוכחית במסך אישור (in-component step) המציג:
  - "נרשמת בהצלחה! 🎉" + פרטי שיבוץ (בית ספר, כיתה, מורה, כלי)
  - סכום לתשלום
  - שני כפתורים: **"המשך לתשלום מאובטח"** (ראשי) ו-**"אשלם בהמשך"** (משני).
- "המשך לתשלום": קריאה ל-`supabase.functions.invoke('icount-create-sm-payment-link', { body: { paymentId } })` → `window.location.href = url`.
- "אשלם בהמשך": ניווט ל-`/school-music/register/pending` עם הודעה שניצור קשר עם קישור לתשלום.

### דף חדש: `src/pages/SchoolMusicRegisterSuccess.tsx`
- נטען כאשר iCount מחזיר את ההורה (success_url).
- שואל את ה-payment לפי `paymentId` ב-query string, מציג סטטוס (אם עוד pending — polling קצר עד שה-webhook עדכן), קישור לקבלה, וכפתור "סיום".

### `src/components/admin/SchoolMusicStudentPaymentsSection.tsx`
- ללא שינויים מבניים — שורת התשלום ה"אוטומטית" תופיע כמו כל תשלום אחר. נוסיף רק תווית קטנה "נוצר בהרשמה" כשיש `payment_link_url` ועדיין `pending`, וכפתור "שלח שוב קישור תשלום" שמייצר מחדש לינק ושולח לאימייל/וואטסאפ של ההורה (אופציונלי — שלב שני).

## דרישות מקדימות מהמשתמש
1. לאשר שב-iCount של העמותה מופעל מודול **סליקת אשראי + דף תשלום (Payment Page)**. בלי זה הלינקים לא ייווצרו.
2. להגדיר ב-iCount את כתובת ה-Webhook לפונקציה החדשה (אתן את ה-URL המדויק אחרי הפריסה).
3. אישור הסכום: כרגע ברירת המחדל היא `annual_tuition_fee=650` לבית ספר. רוצה שזה יישאר ניתן לשינוי פר בית ספר? (כן, כבר נשמר פר רשומה — נמשיך לשם).

## פרטים טכניים (לעיון מפתחים)
- שדה `custom` של iCount הוא מחרוזת חופשית — נשתמש בו לאחסון `payment_id` ולא נסתמך רק על `doc_number`, כדי שמיפוי ה-webhook יהיה דטרמיניסטי.
- ה-RPC ימשיך להיות `SECURITY DEFINER`; ההוספה של שורת התשלום תיעשה בתוך אותה טרנזקציה כדי שלא ייווצר תלמיד בלי שורת תשלום.
- במסך האישור ב-React נשתמש ב-`react-query` עם `refetchInterval` של 2 שניות עד שה-status הופך ל-`paid` או חולפות 60 שניות.
- אבטחת ה-webhook: נאמת לפי `icount_payment_page_id` קיים ב-DB + (אם iCount תומך) חתימה / סוד משותף. אם לא, נאמת לפי קומבינציה של `cid` + `doc_number` שמופיע ב-DB.
- אין צורך בשינוי RLS — `school_music_payments` כבר מאפשר `INSERT` ל-anon וגם `SELECT` ל-anon.

## מחוץ לסקופ (לשלב הבא)
- תשלום בתשלומים (credit card installments).
- שליחה אוטומטית של קישור התשלום בוואטסאפ/אימייל להורים שלא שילמו תוך X ימים.
- חיוב בנפרד עבור פיקדון/השאלת כלי.
