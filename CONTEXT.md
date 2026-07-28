# קונטקסט פרויקט — אולפן ומגמת המוסיקה חוף הכרמל

## מה זה

מערכת ניהול מלאה לאולפן מוסיקה — תלמידים פרטניים, מורים, הרכבים, מוסיקה בבתי ספר, הרשמות, תשלומים, קבלות, דוחות ושכר. בפיתוח פעיל (4+ חודשים). יש לקוחות אמיתיים שמשתמשים בו.

**URL**: https://musichof.com

---

## טכנולוגיה

| שכבה | טכנולוגיה |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite + shadcn/ui + Tailwind |
| Backend | Supabase (DB PostgreSQL + Auth + Edge Functions Deno) |
| חשבונאות + סליקה | iCount API v3 |
| Hosting | Lovable (מחובר לגיטהאב) |
| State | TanStack Query (React Query) |
| Forms | react-hook-form + zod |
| Routing | react-router-dom v6 |

**GitHub**: `https://github.com/CostaKob/Hof-Hacarmel-Cons.git`
**Supabase project ref**: `mtzzalrmtzfrkrpdjjoy`

---

## משתמשים ותפקידים

| תפקיד | route | הרשאות |
|--------|-------|--------|
| admin | /admin/* | גישה מלאה לכל המערכת |
| secretary | /secretary | גישה לניהול שוטף (SecretaryDashboard) |
| teacher | /teacher/* | תלמידים, דוחות, הרכבים, מוסיקה בביה"ס |
| ציבורי | /register, /school-music-register | טפסי הרשמה ציבוריים |

הרשאות מנוהלות דרך טבלת `user_roles` + `ProtectedRoute` ב-React.

---

## מודולים עיקריים

### 1. תלמידים פרטניים
- **טבלות**: `students`, `enrollments`, `student_payments`, `student_notes`
- **שיוך**: תלמיד → רישום (enrollment) ← מורה + כלי + בית ספר + שנת לימוד
- **תשלומים**: חישוב שכר לימוד מ-`payment_settings` (מחיר שנתי / 32 שיעורים, פרורציה לפי תאריך התחלה)
- **קבלות**: iCount `receipt` בלבד (מלכ"ר — אסור חשבונית מס!)

### 2. מוסיקה בבתי ספר (School Music)
- **טבלות**: `school_music_schools`, `school_music_classes`, `school_music_groups`, `school_music_students`, `school_music_payments`, `school_music_sessions`
- מסלול נפרד לחלוטין מהתלמידים הפרטניים
- הרשמה דרך טופס ציבורי `/school-music-register`
- תשלום דרך PayPage של iCount (קישור נוצר ב-`icount-generate-paylink`)

### 3. מורים
- **טבלות**: `teachers`, `teacher_schools`, `teacher_instruments`, `reports`, `report_lines`, `teacher_attendance`, `salary_manual_entries`
- מורה מדווח שיעורים → חישוב שכר לפי `teacher_rate_per_lesson` × מס' שיעורים
- דוח נסיעות, סיכום שנתי
- יצוא דוח שכר

### 4. הרכבים (Ensembles)
- **טבלות**: `ensembles`, `ensemble_students`, `ensemble_staff`
- ניהול הרכבים מוסיקליים, שיוך תלמידים + מורים

### 5. הרשמות (Registrations)
- טופס הרשמה ציבורי דינמי (`/register/:token`)
- **טבלות**: `registrations`, `registration_pages`, `registration_page_fields`, `registration_page_sections`, `registration_form_settings`
- ניהול שדות + סעיפים דרך AdminRegistrationPageEditor
- המנהל ממיר הרשמה לתלמיד (`AdminRegistrationConvert`)

### 6. מלאי כלים
- **טבלות**: `instruments`, `inventory_instruments`, `instrument_loans`, `instrument_repairs`, `instrument_storage_locations`

### 7. מייל
- תשתית queue-based עם `pgmq` (PostgreSQL Message Queue)
- שתי תורים: `auth_emails` (עדיפות גבוהה), `transactional_emails`
- DLQ לכישלונות
- טבלות: `email_send_log`, `email_send_state`, `suppressed_emails`, `email_unsubscribe_tokens`
- Edge Functions: `send-transactional-email`, `process-email-queue`, `send-registration-confirmation`

---

## iCount — מפת Edge Functions

### אימות
iCount משתמש ב-**company_id + username + password** (לא Bearer token):
- `ICOUNT_COMPANY_ID`
- `ICOUNT_USERNAME`
- `ICOUNT_PASSWORD`

### תשלומים — תלמידים פרטניים
| Function | מטרה |
|----------|------|
| `icount-generate-student-paylink` | יוצר PayPage דינמי ב-iCount, מחזיר URL לתשלום |
| `icount-student-payment-webhook` | IPN webhook — מסמן תשלום כשולם, שומר doc_id |
| `icount-create-invoice` | יוצר קבלה ב-iCount לשורת `student_payments` |
| `icount-student-refund-api` | זיכוי: cc/refund (כרטיס) + קבלה במינוס + שורת credit |
| `icount-delete-student-paypage` | מוחק PayPage פתוח (כשרושמים תשלום ידני) |

### תשלומים — מוסיקה בבתי ספר
| Function | מטרה |
|----------|------|
| `icount-generate-paylink` | יוצר PayPage לתשלום School Music |
| `icount-ipn-handler` | IPN webhook School Music |
| `icount-create-sm-receipt` | יוצר קבלה ל-`school_music_payments` |
| `icount-refund-api` | זיכוי School Music |
| `icount-create-sm-payment-link` | קישור לדף תשלום קבוע (לא דינמי) |
| `icount-create-sm-refund` | קבלת זיכוי School Music |
| `icount-delete-paypage` | מוחק PayPage School Music |

### כללי
| Function | מטרה |
|----------|------|
| `icount-webhook` | placeholder — טרם מומש |
| `icount-create-refund` | קבלת זיכוי רגילה (לא CC) |

---

## תהליך תשלום מלא

### תלמיד פרטני
1. Admin מחשב חיוב → `/admin/students/:id/payment`
2. יוצר שורת `student_payments` עם `payment_status = 'pending'`
3. `icount-generate-student-paylink` → יוצר PayPage → מחזיר URL
4. הורה משלם → iCount שולח IPN ל-`icount-student-payment-webhook`
5. Webhook מעדכן `payment_status = 'paid'` + שומר `icount_doc_id`, `icount_doc_number`, `invoice_url`
6. (אופציונלי) Admin לוחץ "הפק קבלה" → `icount-create-invoice`

### School Music
1. הרשמה ציבורית → נוצרת `school_music_payment` עם `payment_status = 'pending'`
2. `icount-generate-paylink` → PayPage → הורה משלם
3. IPN → `icount-ipn-handler` → מעדכן לשולם

---

## תהליך זיכוי — מצב נוכחי (עובד)

### תלמיד פרטני (`icount-student-refund-api`)
1. מקבל `paymentId` + `refundAmount`
2. בודק `remaining` (לא זיכה יותר מהמקסימום)
3. אם CC: מביא `cc_bill_log_id` דרך `/doc/info` → `/cc/transactions` (fallback)
4. קורא ל-`/cc/refund` עם `cc_bill_log_id` + סכום → **הכסף חוזר לכרטיס ✅**
5. יוצר קבלה במינוס (`/doc/create`, `based_on` למסמך המקורי) — הקבלות מקושרות ✅
6. מוסיף שורת credit ב-`student_payments` ✅
7. זיכוי חלקי נתמך ✅ (אפשר מספר זיכויים חלקיים על אותה קבלה)

### School Music (`icount-refund-api`) — אותו מנגנון ✅

### מה שנשאר פתוח (לא באג — מגבלת iCount)
- שורת הזיכוי בטבלת הסליקה של iCount מציגה ⚠️ ללא מסמך מקושר
- **iCount אישרו רשמית**: "אין אפשרות לקשר בין עסקת הזיכוי באשראי לבין המסמך"
- **מבחינה חשבונאית — הכל תקין**: המסמכים מקושרים, הנהלת חשבונות מאוזנת
- הסימן האדום הוא ויזואלי בלבד בדוח "עסקאות" של iCount — לא ניתן לפתור

### בדיקה שנשארה פתוחה
בדיקת end-to-end מלאה: תשלום ₪10 → זיכוי חלקי ₪3 → זיכוי חלקי ₪4 → לוודא שחזרו ₪7 לכרטיס בפועל.

### plan.md
קובץ `.lovable/plan.md` מתאר גישה חלופית עם `doc/cancel` + `refund_cc=1`. **זו הצעה ישנה — לא רלוונטית יותר.** הפתרון הנוכחי עובד.

---

## מבנה הקוד

```
src/
  pages/
    admin/           — כל דפי ניהול (AdminStudents, AdminTeachers, AdminSchoolMusic*, ...)
    Landing.tsx      — דף הבית
    Login.tsx        — התחברות
    PublicRegistration.tsx  — טופס הרשמה ציבורי
    SchoolMusicRegister.tsx — הרשמת מוסיקה בביה"ס
    TeacherDashboard.tsx    — לוח מחוונים מורה
    SecretaryDashboard.tsx  — לוח מחוונים מזכירה
  components/
    admin/           — קומפוננטים לאדמין (AddPaymentDialog, StudentPaymentsSection, ...)
    teacher/         — קומפוננטים למורה
    ui/              — shadcn/ui components
  hooks/
    useAuth.tsx      — Auth context + roles
    useAcademicYear.tsx — שנת לימוד פעילה + בחירה
    useTeacherData.tsx  — data hook למורה
    ...
  lib/
    paymentCalc.ts   — חישוב שכר לימוד (32 שיעורים/שנה, פרורציה)
    lessonCounts.ts  — ספירת שיעורים
    constants.ts     — GRADES, STUDENT_STATUSES, PLAYING_LEVELS
    phoneValidation.ts
    sortHebrew.ts

supabase/
  functions/         — Edge Functions (Deno)
  migrations/        — SQL migrations
```

---

## DB — טבלות מרכזיות

| טבלה | תיאור |
|------|-------|
| `academic_years` | שנות לימוד + הנחות (אח/ת, כלי שני, מגמה) |
| `students` | תלמידים + פרטי הורים |
| `enrollments` | שיוך תלמיד ↔ מורה + כלי + בי"ס + שנה |
| `student_payments` | תשלומים + קבלות (private) |
| `teachers` | מורים |
| `reports` / `report_lines` | דוחות שיעורים של מורים |
| `school_music_schools` | בתי ספר (שנתי) |
| `school_music_classes` | כיתות בבי"ס |
| `school_music_groups` | קבוצות נגינה |
| `school_music_students` | תלמידי מוסיקה בבי"ס |
| `school_music_payments` | תשלומים (school music) |
| `registrations` | הרשמות ציבוריות |
| `ensembles` | הרכבים |
| `payment_settings` | מחירים שנתיים לפי משך שיעור |

---

## חישוב שכר לימוד

- **32 שיעורים** לשנה (`LESSONS_PER_YEAR`)
- מחיר שנתי כולל מע"מ (מלכ"ר — ללא מע"מ בפועל, `vat_free=1`)
- פרורציה לפי תאריך התחלה: `(ימים שנותרו / ימי שנה) × 32`
- הנחות: אח/ת (`sibling`), כלי שני (`secondInstrument`), מגמה (`majorStudent`) — % מ-`academic_years`

---

## אופן עבודה עם Claude

**זרימה**:
1. Claude כותב/מתקן קבצים ישירות ל-`/Users/costa/Desktop/proj`
2. Costa מריץ `cd ~/Desktop/proj && git add . && git commit -m "..." && git push`
3. Lovable מסתנכרן → לוחץ Deploy
4. כש-Lovable עשה שינויים → Costa מריץ `git pull`

**עיקרון**: תיקונים קטנים + Edge Functions דרך Claude. פיצ'רים גדולים עם UI מורכב דרך Lovable.

---

## עיצוב וסגנון

**סגנון כללי**: Apple-inspired — נקי, מרווח, עגלגל. RTL מלא (`direction: rtl` על כל ה-body).

**פלטת צבעים (HSL)**:
| משתנה | ערך | תיאור |
|--------|-----|--------|
| `--primary` | `205 75% 60%` | כחול שמיים — הצבע הראשי |
| `--background` | `60 20% 98%` | לבן חמים (off-white) |
| `--foreground` | `215 25% 15%` | כחול כהה (כמעט שחור) |
| `--card` | `0 0% 100%` | לבן טהור |
| `--muted` | `210 20% 95%` | אפור-כחלחל בהיר |
| `--destructive` | `4 70% 52%` | אדום |
| `--border` | `210 20% 89%` | גבול עדין |
| `--radius` | `0.875rem` | פינות מעוגלות |

**קומפוננטים**: shadcn/ui עם `rounded-xl` / `rounded-2xl` בשימוש נרחב. כרטיסים עם `shadow-sm`. כפתורים `h-10` / `h-11`.

**דף הבית (Landing)**: תמונת תזמורת, כותרת "אולפן ומגמת המוסיקה חוף הכרמל", שני כרטיסי הרשמה (לבתי ספר / פרטניים), רקע כחול-בהיר לסקשן ההרשמה.

**לוגו**: קובץ `src/assets/logo.png` — לוגו האולפן עם תווים מוסיקליים.

## נקודות חשובות

- **מלכ"ר** — רק קבלות (`receipt`), אסור חשבונית מס!
- **iCount auth** — company_id + user + pass (לא Bearer token)
- **RTL** — כל ה-UI בעברית ימין לשמאל
- **שנת לימוד פעילה** — מנוהלת דרך `AcademicYearProvider`, רוב הנתונים מסוננים לפיה
- **Supabase project**: `mtzzalrmtzfrkrpdjjoy`
- יש בדיקות vitest ב-`src/lib/__tests__/` — לא לשבור!
