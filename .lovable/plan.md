## תכנית פיתוח: מודול נוכחות מורים בבתי ספר מנגנים

### 1. שינויי מסד נתונים

**school_music_schools — שינוי שדה ימי פעילות**
- הוספת עמודה חדשה `operating_days smallint[]` (מערך של ימי שבוע 0-6, ראשון עד שישי)
- מיגרציה: העברת `day_of_week` הקיים למערך (אם קיים ערך → `[day_of_week]`, אחרת `[]`)
- השארת `day_of_week` הישן לתאימות לאחור (לא נמחק כעת כדי לא לשבור קוד קיים)

**טבלה חדשה: `teacher_attendance`**
- `id UUID PK`
- `school_music_school_id UUID NOT NULL` — בית ספר מנגן
- `teacher_id UUID NOT NULL` — מורה
- `attendance_date DATE NOT NULL`
- `status TEXT NOT NULL` — enum חדש `attendance_status`: `present` / `absent`
- `notes TEXT` — סיבת היעדרות
- `academic_year_id UUID NOT NULL`
- `created_by_user_id UUID`, `created_at`, `updated_at`
- UNIQUE על (school_music_school_id, teacher_id, attendance_date)
- RLS:
  - אדמין: ניהול מלא
  - רכז (coordinator_teacher_id של בית הספר): ניהול נוכחות עבור בתי הספר שלו
  - מורה: צפייה בנוכחות שלו

### 2. ממשק אדמין — טופס בית ספר מנגן

`AdminSchoolMusicSchoolForm.tsx`:
- החלפת השדה הקיים "יום פעילות" ברכיב MultiSelect (Checkboxes לראשון–שישי)
- הצגה בכרטיס בית הספר: "ימי פעילות: ראשון, שלישי, חמישי"

### 3. ממשק מורה רכז — "בתי הספר המנגנים שלי"

ב-`TeacherSchoolMusicSchools.tsx`, לכל בית ספר שהמורה הוא רכז שלו:
- כפתור **"דיווח נוכחות"** → `/teacher/school-music/:schoolId/attendance/new`
- כפתור **"דוח נוכחות"** → `/teacher/school-music/:schoolId/attendance`

### 4. דף דיווח נוכחות (רכז)

`TeacherSchoolMusicAttendanceReport.tsx`:
- בורר תאריך (ברירת מחדל: היום, מותר עבר)
- שליפת כל המורים המשויכים לבית הספר (קבוצות + מנצח + רכז)
- כפתור "כולם הגיעו" — סימון כל המורים כנוכחים
- לכל שורה: Toggle נוכח/נעדר. אם נעדר → תיבת טקסט לסיבה
- כפתור "שמירה" — upsert לפי unique constraint
- אם כבר קיימים נתונים לתאריך, טעינתם

### 5. דוח נוכחות רכז

`TeacherSchoolMusicAttendanceList.tsx`:
- מסננים: טווח תאריכים, מורה (dropdown), סטטוס
- טבלה: תאריך, שם מורה, סטטוס, הערות
- מסונן רק לבתי הספר שהמורה רכז שלהם

### 6. דוח נוכחות אדמין

`AdminSchoolMusicAttendance.tsx` בדשבורד האדמין:
- מסננים: בית ספר, מורה, טווח תאריכים, סטטוס
- טבלה ראשית: תאריך, בית ספר, מורה, סטטוס, הערות
- **לוגיקת "טרם דווח"**: לכל יום בטווח שבו `day_of_week ∈ operating_days` של בית הספר ולא קיימת רשומת נוכחות → שורה מסומנת "טרם דווח" (badge בולט)

### 7. אזהרה במודול תשלומים

ב-`AddPaymentDialog` (וכל מקום נוסף שמפיק חשבונית/זיכוי iCount):
- לפני קריאת ה-edge function `icount-create-invoice` / `icount-create-refund` — `AlertDialog` אישור:
  - "הפקת חשבונית סופית — לא ניתנת לביטול. להמשיך?"
  - "הפקת זיכוי — פעולה בלתי הפיכה. להמשיך?"

### 8. ניווט

- הוספת ראוטים חדשים ב-`App.tsx`
- הוספת קישור "נוכחות מורים" בדשבורד האדמין

### פרטים טכניים

- Enum: `CREATE TYPE attendance_status AS ENUM ('present', 'absent')`
- אינדקסים: `(school_music_school_id, attendance_date)`, `(teacher_id, attendance_date)`
- Helper לרשימת מורי בית ספר: רכז + מנצח + מורי `school_music_groups` (DISTINCT)
- כל הטפסים RTL, h-12 inputs, rounded-xl, sticky footer במובייל
