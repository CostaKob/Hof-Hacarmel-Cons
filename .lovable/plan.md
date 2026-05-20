# מעבר לעמוד סליקה קבוע פר בית ספר עם פרה-פיל ב-URL

## הרעיון
במקום ליצור עמוד סליקה חדש ב-iCount בכל הרשמה, נשמור פר בית ספר URL **קבוע אחד** של עמוד תשלום ב-iCount (`payment_page_url`). בעת הפנייה לתשלום נצרף ל-URL הזה query params עם פרטי התלמיד והקישור הפנימי, כך ש-iCount יציג את הפרטים מולאים מראש וה-webhook יוכל לזהות בדיוק לאיזו שורה לשייך את התשלום.

iCount תומך בפרה-פיל של שדות בעמוד תשלום קבוע דרך query string (למשל `?sum=650&client_name=...&email=...&custom=<payment_id>`). השדה `custom` הוא קריטי — הוא חוזר ב-webhook ומאפשר שיוך דטרמיניסטי לשורת ה-payment ב-DB.

## שינויי DB (מיגרציה)

טבלת `school_music_schools` — הוספת עמודות:
- `icount_payment_page_url text` — ה-URL הקבוע של עמוד התשלום ב-iCount עבור בית הספר הזה (האדמין מדביק אותו מתוך iCount).
- `icount_payment_page_id text` — אופציונלי, לזיהוי חוזר ב-webhook.

טבלת `school_music_payments` — נסיר את הצורך ליצירת עמוד דינמי. השדה `payment_link_url` יישאר (נשמור בו את ה-URL הסופי