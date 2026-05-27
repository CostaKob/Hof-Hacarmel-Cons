## מה קורה היום
ב-`AdminStudentPaymentCalc` יש כפתור **"צור קישור תשלום"** (`handleGenerateLink`) שמדפיס payload ל-console ומציג toast — אין חיבור אמיתי ל-iCount.

טבלת `student_payments` היום שומרת רק תשלומים שכבר בוצעו — אין בה `payment_status`, `payment_link_url`, `icount_payment_page_id`, `paid_at`, `icount_transaction_id`.

## המטרה
דף סליקה דינמי לכל תלמיד פרטני, באותו דפוס של בי״ס מנגן:
- שם התלמיד ופירוט החיוב בעגלה
- מילוי אוטומטי של פרטי ההורה (אין צורך בת״ז במסך הראשון)
- אחרי תשלום: ה-paypage נמחק מ-iCount, ה-row מסומן כ"שולם" עם קבלה אוטומטית
- הקישור נשמר על ה-row "הממתין" — לחיצה חוזרת מחזירה את אותו קישור (אלא אם הסכום השתנה)

## שלב 1 — מיגרציה
הוספת עמודות ל-`student_payments`:
- `payment_status` (enum: `pending` / `paid` / `failed`, default `paid` לתאימות לאחור)
- `payment_link_url` (text)
- `icount_payment_page_id` (text)
- `paid_at` (timestamptz)
- `icount_transaction_id` (text)

כל הרשומות הקיימות יסומנו `paid` כברירת מחדל.

## שלב 2 — Edge Function חדשה: `icount-generate-student-paylink`
מבוססת על `icount-generate-paylink` (בי״ס מנגן), אבל עובדת על `student_payments` ו-`students`:

קלט: `{ studentId, amount, lines: [{description, amount}], paymentId? }`
- אם אין `paymentId` או שאין pending row — יוצרת רשומה חדשה ב-`student_payments` עם `transaction_type='payment'`, `payment_status='pending'`, `amount=balance`, `enrollment_breakdown=lines`, `notes='נוצר ידנית - ממתין לתשלום'`
- קוראת ל-`paypage/create` של iCount עם:
  - `page_name`: `תשלום שכר לימוד - <שם התלמיד>`
  - `items`: שורה אחת לכל שיוך (כלי + מורה + סניף)
  - `ipn_url`: handler חדש (ראה שלב 3)
  - `success_url`: דף תודה
  - `require_id: 0` (לא צריך ת״ז במסך הראשון)
- שומרת `payment_link_url`, `icount_payment_page_id` על ה-row
- ממלאת אוטומטית `fname`, `lname`, `email`, `phone`, `id_no`, `name_on_invoice`, `custom1=paymentId` כ-URL params

## שלב 3 — Edge Function חדשה: `icount-student-payment-webhook`
מבוססת על `icount-sm-payment-webhook`, אבל עובדת על `student_payments`:
- מוצאת את ה-row לפי `custom1` (paymentId), או fallback לפי `icount_payment_page_id` / `docnum`
- מעדכנת: `payment_status='paid'`, `paid_at=now()`, `icount_doc_id/number/url`, `payment_method='credit_card'`, `icount_transaction_id`
- מוחקת את ה-paypage ב-iCount (`paypage/delete`)
- מאפסת `payment_link_url`

## שלב 4 — Frontend
ב-`AdminStudentPaymentCalc.handleGenerateLink`:
- קוראת ל-`icount-generate-student-paylink` עם הסכום, השיוכים והפירוט
- פותחת את הקישור ב-tab חדש + מעתיקה ל-clipboard + toast עם הקישור

ב-`StudentPaymentsSection`:
- הצגת badge "ממתין לתשלום" על rows עם `payment_status='pending'`
- כפתור "פתח קישור" / "העתק קישור" ל-row ממתין
- אם כבר יש pending עם אותו סכום — לא ליצור חדש, להחזיר את הקיים

## נקודות טכניות
- אותו דפוס של VAT exempt (מלכ״ר → `tax_exempt: true`)
- `currency_id: 5` (ש״ח), `language: he`, `hide_lang: 1`, `max_payments: 1`
- success_url: `https://musichof.com/payment-success?status=ok&payment_id=<id>` (דף חדש פשוט)
- ה-IPN handler החדש צריך `verify_jwt = false` ב-`supabase/config.toml`
- הקבלה האוטומטית מ-iCount מחליפה את "הפק קבלה" הידני הקיים — אם משלמים בלינק, יש כבר `icount_doc_id` ולא יוצג כפתור "הפק קבלה"

## מה לא משתנה
- חישובי תמחור/הנחות ב-`paymentCalc.ts` — נשארים
- "הפק קבלה" ידני ו"זיכוי" קיימים — נשארים, עובדים על rows שכבר `paid` או שהוזנו ידנית
- AddPaymentDialog להזנה ידנית — נשאר