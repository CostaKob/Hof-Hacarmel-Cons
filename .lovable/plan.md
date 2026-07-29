## מטרה

להביא לכרטיס המשפחה את מלוא הפונקציונליות של כרטיס תלמיד — אותו דיאלוג `תשלום/זיכוי` (כולל פיצול, פריסת צ׳קים, מזומן, ביטול קישור, שליחת הודעה להורה), עם תמיכה בכך שכל שיוך שייך לילד אחר במשפחה.

## מבנה כללי

מודל הנתונים שהוסכם: **שורה ב-`student_payments` לכל ילד/שיוך**, כל השורות של אותה פעולה חולקות `family_payment_group_id` יחיד + `family_parent_national_id` של ההורה. כך כל ילד רואה בכרטיסו את חלקו, וההיסטוריה המשפחתית מאחדת דרך `family_payment_group_id`.

## שינויים

### 1. הרחבת `AddPaymentDialog.tsx` למצב משפחה

הוספת prop חדש (אופציונלי, אחורית תואם):

```ts
familyContext?: {
  parentNationalId: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  familyGroupId: string;                  // UUID חדש שנוצר לפני פתיחת הדיאלוג
  children: { id: string; first_name: string; last_name: string }[];
  overrideItems: FamilyPaymentItem[];     // מגיע מ-computeChildTotals
}
```

כשה-`familyContext` מסופק:
- `paymentItems` נלקח מ-`overrideItems` (כל פריט נושא `studentId`, `enrollmentId`, `label`, `subLabel`, `defaultAmount`, `kind`).
- ה-label של הפריט מקבל תחילית עם שם הילד: `נטע · חצוצרה — כרם מהר״ל`.
- ב-`mutation` (שמירת שורות מזומן/צ׳ק/עריכה): פותחים את `rows` לפי `studentId` של הפריט במקום `studentId` יחיד, ומוסיפים לכל שורה `family_parent_national_id` + `family_payment_group_id`. שורות פיצול לצ׳קים נשארות מקובצות דרך `payment_group_id` (הקיים) בתוך `family_payment_group_id`.
- ב-`generateLinkMutation` ו-`splitLinksMutation`: לפני קריאת `icount-generate-student-paylink` יוצרים שורת pending אחת לכל ילד (עם `family_*` וה-lines שלו), ואחר כך קוראים ל-Edge בשם הילד ה"עוגן" (הראשון) עם payload מלא של כל השורות. הקישור נשמר על שורת ה-pending של הילד העוגן; שאר השורות משמשות לתצוגת התחייבות פר-ילד בכרטיסי התלמיד.
  - `payerDetails` מגיעים מ-`familyContext.parentName/email/phone`, `payerLabel = "משפחה - <שם>"`.
- מפתחות ה-invalidate של react-query מורחבים לכל ילדי המשפחה + `["family-details", parentNationalId]`.

הכללים הקיימים (checks/split/edit/delete) פועלים כרגיל — הלוגיקה זהה, רק סט הפריטים והשיוך לילדים משתנה.

### 2. `AdminFamilyCard.tsx` — החלפת בלוק "יצירת קישור מאוחד"

- מחיקת ה-mutation `generateFamilyLink` הישן ובלוק ה-UI של הקישור הבודד.
- הוספת כפתור אחד `+ תשלום / זיכוי` שפותח את `AddPaymentDialog` במצב משפחה עם:
  - `studentId` = הילד הראשון (עוגן).
  - `enrollments` = איחוד השיוכים של כל הילדים.
  - `familyContext` נבנה מ-`family` + `perChild` (הפריטים המחושבים).
- ה-checkboxes הקיימים בפירוט פר-ילד קובעים אילו `overrideItems` נכנסים לדיאלוג (ברירת מחדל: כל השיוכים הפעילים המסומנים היום).

### 3. רשימת "קישורי תשלום ממתינים"

בלוק חדש בכרטיס המשפחה שמראה את כל שורות ה-pending של הילדים עם `family_payment_group_id` (מקובצות לפי group):
- לכל group: סכום כולל, שם משלם/label, כפתורי פתח/העתק, וכפתור ביטול שקורא ל-`icount-delete-student-paypage` על כל שורה בקבוצה ואז מוחק את כל השורות. מבוסס על הבלוק הקיים ב-`AdminStudentPaymentCalc.tsx` (שורות 1517-1602).

### 4. טבלת התשלומים המשפחתית — הפעלת פעולות

הרחבת הטבלה הקיימת (`payments`) עם:
- כפתור "הפק קבלה מאוחדת" לכל group שאין לו `icount_doc_id` (קורא ל-`icount-create-invoice` עם `groupId = family_payment_group_id`).
  - זה דורש הרחבה קטנה של `icount-create-invoice` לקבל `familyGroupId` כאלטרנטיבה ל-`groupId`, שיאסוף את כל השורות עם אותו `family_payment_group_id`. אם ההרחבה נדחית — נעבור לקבלה נפרדת לילד ונאחד בהצגה.
- כפתור זיכוי (`Undo2`) לכל שורה עם `icount_doc_id` — מפעיל `icount-create-refund` / `icount-student-refund-api` בדיוק כמו ב-`StudentPaymentsSection`.
- כפתור עריכה שפותח את `AddPaymentDialog` במצב עריכה של אותה שורה (single-student), נשאר תואם לקוד הקיים.

### 5. שליחת הודעה להורה

כפתור `שלח הודעה להורה` שפותח את `SendTeacherAssignmentMessage` הקיים במצב משפחה — עם רשימה מאוחדת של השיוכים של כל הילדים והקישור החדש (אם נוצר). מעבירים prop `enrollments` = איחוד + `student` = ההורה (או הילד העוגן) + הקישור האחרון.

## סדר ביצוע

1. הרחבת `AddPaymentDialog.tsx` עם `familyContext` (התוספת בהחלט הכי גדולה — ~120 שורות).
2. הוספת עמודת `studentId` ל-`FamilyChildTotals.enrollments` ב-`src/lib/familyCalc.ts` אם חסרה.
3. הרחבת `icount-create-invoice/index.ts` לתמיכה ב-`familyGroupId`.
4. שכתוב הבלוקים ב-`AdminFamilyCard.tsx`: כפתור תשלום/זיכוי, רשימת ממתינים, טבלה עם פעולות, כפתור הודעה להורה.
5. בדיקה: יצירת קישור מאוחד → תשלום אמיתי → זיהוי דרך webhook → שורות של כל הילדים עוברות ל-`paid`; ואז ביטול קישור ממתין; ואז פריסת צ׳קים למשפחה עם 2 ילדים.

## מחוץ לסקופ

- קבלה משפחתית שמופיעה בכרטיסי כל הילדים במקום אחד (כרגע כל ילד יראה את חלקו).
- רענון פרטי משלם ידני אחרי יצירה — נשמרים כמו היום דרך `payerDetails` מה-family.
