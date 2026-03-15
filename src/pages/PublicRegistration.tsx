import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Music } from "lucide-react";
import AppLogo from "@/components/AppLogo";

const registrationSchema = z.object({
  studentFullName: z.string().min(2, "יש להזין שם מלא").max(100),
  gender: z.string().optional(),
  studentNationalId: z.string().min(1, "שדה חובה").max(20),
  studentStatus: z.string().optional(),
  branchSchoolName: z.string().min(1, "שדה חובה"),
  studentSchoolText: z.string().min(1, "שדה חובה"),
  grade: z.string().min(1, "שדה חובה"),
  city: z.string().min(1, "שדה חובה"),
  studentPhone: z.string().optional(),
  requestedInstruments: z.array(z.string()).min(1, "יש לבחור לפחות כלי אחד"),
  requestedLessonDuration: z.string().min(1, "שדה חובה"),
  parentName: z.string().min(1, "שדה חובה"),
  parentNationalId: z.string().min(1, "שדה חובה"),
  parentPhone: z.string().min(1, "שדה חובה"),
  parentEmail: z.string().email("כתובת דוא\"ל לא תקינה"),
  approvalChecked: z.literal(true, { errorMap: () => ({ message: "יש לאשר את תנאי ההרשמה" }) }),
});

type RegistrationForm = z.infer<typeof registrationSchema>;

const GRADES = ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "יא", "יב", "בוגר"];

const GENDER_OPTIONS = [
  { value: "male", label: "זכר" },
  { value: "female", label: "נקבה" },
  { value: "prefer_not_to_say", label: "מעדיף/ה לא לציין" },
];

const STUDENT_STATUS_OPTIONS = [
  { value: "new", label: "תלמיד/ה חדש/ה באולפן המוסיקה" },
  { value: "continuing", label: "תלמיד/ה ממשיך/ה באולפן המוסיקה" },
];

const LESSON_DURATION_OPTIONS = [
  { value: "30", label: "30 דקות — תלמידי שנה ראשונה כיתות א-ד בלבד" },
  { value: "45", label: "45 דקות" },
  { value: "60", label: "60 דקות" },
];

const PublicRegistration = () => {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: instruments = [] } = useQuery({
    queryKey: ["public-instruments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: schools = [] } = useQuery({
    queryKey: ["public-schools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: activeYear } = useQuery({
    queryKey: ["public-active-year"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academic_years").select("id, name").eq("is_active", true).single();
      if (error) return null;
      return data;
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      requestedInstruments: [],
      approvalChecked: undefined as any,
    },
  });

  const selectedInstruments = watch("requestedInstruments") || [];
  const approvalChecked = watch("approvalChecked");

  const toggleInstrument = (instrumentName: string) => {
    const current = selectedInstruments;
    const updated = current.includes(instrumentName)
      ? current.filter((i) => i !== instrumentName)
      : [...current, instrumentName];
    setValue("requestedInstruments", updated, { shouldValidate: true });
  };

  const onSubmit = async (data: RegistrationForm) => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      const nameParts = data.studentFullName.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || firstName;

      const { error } = await supabase.from("registrations" as any).insert({
        academic_year_id: activeYear?.id || null,
        student_first_name: firstName,
        student_last_name: lastName,
        student_national_id: data.studentNationalId.trim(),
        gender: data.gender || null,
        student_status: data.studentStatus || null,
        branch_school_name: data.branchSchoolName,
        student_school_text: data.studentSchoolText.trim(),
        grade: data.grade,
        city: data.city.trim(),
        student_phone: data.studentPhone?.trim() || null,
        requested_instruments: data.requestedInstruments,
        requested_lesson_duration: data.requestedLessonDuration,
        parent_name: data.parentName.trim(),
        parent_national_id: data.parentNationalId.trim(),
        parent_phone: data.parentPhone.trim(),
        parent_email: data.parentEmail.trim(),
        approval_checked: true,
        status: "new",
      });

      if (error) throw error;
      setSubmitted(true);
    } catch (err: any) {
      console.error("Registration error:", err);
      setSubmitError("אירעה שגיאה בשליחת הטופס. אנא נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
        <Card className="w-full max-w-lg text-center">
          <CardContent className="pt-10 pb-10 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold text-foreground">ההרשמה נקלטה בהצלחה!</h2>
            <p className="text-muted-foreground text-lg">ניצור קשר לאחר בדיקת הפרטים.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4" dir="rtl">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <AppLogo size="lg" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-snug">
            טופס הרשמה ללימודי נגינה באולפן המוסיקה חוף הכרמל
            <br />
            לשנת הלימודים תשפ&quot;ז (2026-2027)
          </h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">אולפן המוסיקה &quot;חוף הכרמל&quot; רישום ומידע תשפ&quot;ז</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-sm leading-relaxed text-foreground">
            <p>
              אולפן המוסיקה חוף הכרמל הינו קונסרבטוריון מוכר ע&quot;י משרד החינוך המאפשר לכל תלמיד/ה שמעוניין/ת להירשם ללימודי נגינה במגוון כלים רחב: כינור, צ&apos;לו, סקסופון, קלרינט, חליל צד, חליליות, חצוצרה, טרומבון, קרן יער, טובה, פסנתר, גיטרה קלאסית, גיטרה חשמלית, גיטרה בס, תופים וכלי הקשה, פיתוח קול, תיאוריה והלחנה.
            </p>
            <p>
              רק במקרה של הרשמה נמוכה לכלי כלשהו, או נרשמים רבים מדי, ניאלץ לענות בשלילה או לדחות לזמן מה את בקשת הרישומים.
            </p>
            <p>
              לצד השיעורים הפרטניים פועלים במסגרת האולפן הרכבים מוסיקליים (תזמורות, מקהלות, הרכבים קאמריים קלאסיים, הרכבי ג&apos;אז ומוסיקה קלה) ושיעורי תיאוריה קבוצתיים.
            </p>

            <div>
              <h3 className="font-bold text-base mb-2">סדרי הלימוד:</h3>
              <ul className="space-y-2 pr-4">
                <li>• לימודי הנגינה יתחילו בתחילת ספטמבר ויסתיימו בסוף יוני. חודש יולי הינו חודש פעילות גם כן במידה ויש צורך בהשלמת שיעורים.</li>
                <li>• שיעור הנגינה מתקיים אחת לשבוע בהתאם לחופשות בתי הספר ומשרד החינוך. במשך השנה יינתן לכל תלמיד מינימום של 32 שיעורים פרטניים, מלבד קונצרטים, השמעות ופעילויות נוספות בנוכחות המורה. תלמיד שיתחיל ללמוד לאחר תחילת שנת הלימודים, יקבל מספר שיעורים בהתאם למספר חודשי הלימוד הנותרים.</li>
                <li>• בבתי הספר יתקיימו השיעורים במהלך שעות הלימודים בין כתלי בית הספר. בשלוחות היישוביות יתקיימו השיעורים החל משעות הצהריים ועד לשעות הערב.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-base mb-2">היעדרויות והחזרי שיעורים:</h3>
              <ul className="space-y-2 pr-4">
                <li>• במקרה של היעדרות, יודיעו התלמיד או הוריו על כך למורה לפחות 24 שעות מראש.</li>
                <li>• היעדרות מוצדקת משיעור נגינה נובעת רק מסיבות רפואיות או פעילות בית הספר ובגינה יוחזר השיעור שהופסד.</li>
                <li>• נסיעה לחו&quot;ל על זמן לימודים נחשבת להיעדרות בלתי מוצדקת ולא יוחזרו שיעורים בגינה.</li>
                <li>• לא יושלמו שיעורים שהוחסרו בגין פעילות מוסיקלית במסגרת אולפן המוסיקה (ימי חזרות מרוכזים, ימי הופעות, כנסי תזמורת, מקהלה והרכבים, משלחות לחו&quot;ל וכדומה) לתלמידים הלוקחים חלק בפעילות זאת.</li>
                <li>• היעדרות מכל סיבה שהיא ללא הודעה של 24 שעות מראש תחשב להיעדרות בלתי מוצדקת.</li>
                <li>• במידה ותלמיד אינו מגיע לשיעור ולא הודיע על כך מראש או שההיעדרות אינה מוצדקת השיעור ייחשב כשיעור שהתקיים.</li>
                <li>• במידה ולא הושלמה מכסת השיעורים המגיעה לתלמיד עד 20 ביוני, מורי האולפן ישלימו שיעורים במהלך סוף חודש יוני ובמהלך חודש יולי. לא יינתן החזר כספי במידה והתלמיד יבחר לא להגיע לשיעורי ההשלמה המוצעים ע&quot;י המורה בחודשים יוני - יולי.</li>
                <li>• במקרה של אירועים בלתי צפויים שבגינם לא תתאפשר הוראה פרטנית פרונטלית (שביתה/ מגפה/ מלחמה וכדומה) מורי אולפן המוסיקה יעברו למתכונת של הוראה מרחוק (זום/ גוגל מיט או כל פלטפורמה טובה אחרת). על התלמידים להגיע לשיעורים המקוונים. לא יושלמו שיעורים בגין היעדרות משיעורים מקוונים.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-base mb-2">הפסקת לימודי נגינה באמצע השנה:</h3>
              <ul className="space-y-2 pr-4">
                <li>• על הפסקת לימודים יש להודיע בכתב לאולפן המוסיקה חוף הכרמל לכתובת המייל: music.hof@gmail.com</li>
                <li>• ניתן לבטל הרשמה עד ה 1 במרץ. תלמיד שיודיע על הפסקת לימודיו לאחר ה 1 במרץ, יחויב עד סוף השנה.</li>
                <li>• במקרה ותלמיד בחר להפסיק את לימודיו עד ה 1 במרץ, תינתן זכאות להחזר החל מהחודש העוקב להודעה ועד לסוף השנה.</li>
                <li className="text-muted-foreground">לדוגמא: תלמיד אשר הפסיק את לימודיו באמצע חודש ינואר יחויב עד לסוף אותו החודש וההחזר יינתן החל מהחודש הבא - חודש פברואר.</li>
                <li>• במידה והתשלום בוצע באשראי, ימשיכו התשלומים לרדת עד סוף תקופת החיוב וההחזר יתבצע בתשלום אחד, בהעברה בנקאית על כל היתרה.</li>
                <li>• לא יינתן החזר כספי על שיעורים שהוחסרו במקרה של הפסקת לימודים באמצע השנה, אך תינתן אפשרות להשלימם.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-base mb-2">הסדרי תשלום והרשמה:</h3>
              <p className="mb-2">לאחר מילוי טופס זה ואישור כל פרטיו יחזרו אליכם טלפונית ממזכירות אולפן המוסיקה.</p>
              <p className="mb-1 font-medium">אפשרויות התשלום ללימודים באולפן המוסיקה:</p>
              <ul className="space-y-1 pr-4 mb-3">
                <li>- תשלום באמצעות כרטיס אשראי (עם אפשרות עד 10 תשלומים שווים) בתשלום מראש לכל השנה.</li>
                <li>- תשלום באמצעות שיקים (עם אפשרות עד 10 תשלומים שווים).</li>
                <li>- תשלום אחד במזומן לכל השנה.</li>
              </ul>
              <ul className="space-y-2 pr-4">
                <li>• במידה ומופסקים הלימודים בכפוף לכתוב לעיל לא מופסקת הגבייה מהכרטיס, וההחזר הנדרש מתבצע בהעברה בנקאית בתשלום אחד על כל היתרה.</li>
                <li>• תלמיד לא יוכל להתחיל ללמוד ללא הסדר התשלום, וללא חתימת ההורים על טופס זה והסכמתם על כל תנאיו.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-base mb-2">תעריפי לימודים באולפן המוסיקה:</h3>
              <ul className="space-y-1 pr-4">
                <li>• שיעור פרטני 45 דקות: 480 ₪ לחודש</li>
                <li>• שיעור פרטני 60 דקות: 580 ₪ לחודש</li>
                <li>• שיעור פרטני 30 דקות (תלמידי שנה ראשונה, כיתות א-ד בלבד): 350 ₪ לחודש</li>
                <li>• שיעור בקבוצה (תאוריה / הרכבים / הפקה מוסיקלית): 280 ₪ לחודש</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-base mb-2">הנחות:</h3>
              <ul className="space-y-1 pr-4">
                <li>• נרשמים בהרשמה מוקדמת עד ה – 15.7 זכאים ל 5% הנחה משכר הלימוד.</li>
                <li>• תלמידי השלוחות הישוביות (אחה&quot;צ) זכאים ל 5% הנחה משכר הלימוד.</li>
                <li>• תלמידי המגמה למוזיקה זכאים להנחה בגובה 10% משכר הלימוד.</li>
                <li>• הנחה עבור אח שני / כלי שני 5% הנחה משכר הלימוד (הנמוך מבינהם).</li>
              </ul>
              <p className="mt-2 text-muted-foreground text-xs">* אין כפל הנחות</p>
              <p className="text-muted-foreground text-xs">* ההנחות תקפות לשיעורים פרטניים בלבד</p>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-bold text-base mb-2">לברורים נוספים, פניות אישיות וכד&apos;:</h3>
              <p>טלפון: 054-7467498 קורין, בין השעות 8:30-14:30 (הודעות וואטסאפ)</p>
              <p>דוא&quot;ל: music.hof@gmail.com</p>
            </div>

            <div className="text-center pt-2 space-y-1">
              <p className="font-bold">מאחלים לכולנו שנת מוסיקה פורייה ומהנה!</p>
              <p className="text-muted-foreground">עמיר סטולר - מנהל אולפן המוסיקה חוף כרמל</p>
              <p className="text-muted-foreground">קורין פאר - מזכירות אולפן המוסיקה</p>
              <p className="text-muted-foreground">צוות האולפן ומוריו</p>
            </div>
          </CardContent>
        </Card>

        {/* Approval Checkbox */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id="approval"
                checked={approvalChecked === true}
                onCheckedChange={(checked) =>
                  setValue("approvalChecked", checked === true ? true : (undefined as any), { shouldValidate: true })
                }
                className="mt-0.5"
              />
              <Label htmlFor="approval" className="text-sm font-bold cursor-pointer leading-snug">
                קראתי את המידע ואני מאשר/ת את תנאי ההרשמה והלימודים
              </Label>
            </div>
            {errors.approvalChecked && (
              <p className="text-sm text-destructive">{errors.approvalChecked.message}</p>
            )}
          </CardContent>
        </Card>

          {/* Student Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">פרטי התלמיד/ה</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldGroup label="שם מלא של התלמיד/ה" error={errors.studentFullName?.message} required>
                <Input {...register("studentFullName")} placeholder="שם פרטי ושם משפחה" />
              </FieldGroup>

              <FieldGroup label="לשון פנייה">
                <div className="flex flex-wrap gap-3">
                  {GENDER_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" value={opt.value} {...register("gender")} className="accent-primary" />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </FieldGroup>

              <FieldGroup label="תעודת זהות התלמיד/ה" error={errors.studentNationalId?.message} required>
                <Input {...register("studentNationalId")} placeholder="מספר תעודת זהות" />
              </FieldGroup>

              <FieldGroup label="תלמיד חדש/ה או ממשיך/ה">
                <div className="flex flex-col gap-2">
                  {STUDENT_STATUS_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" value={opt.value} {...register("studentStatus")} className="accent-primary" />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </FieldGroup>

              <FieldGroup label="שלוחת לימודים" error={errors.branchSchoolName?.message} required>
                <Select dir="rtl" onValueChange={(val) => setValue("branchSchoolName", val, { shouldValidate: true })}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחרו שלוחה" />
                  </SelectTrigger>
                  <SelectContent>
                    {schools.map((s) => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldGroup>

              <FieldGroup label="בית הספר בו לומד/ת התלמיד/ה" error={errors.studentSchoolText?.message} required>
                <Input {...register("studentSchoolText")} placeholder="שם בית הספר" />
              </FieldGroup>

              <FieldGroup label='כיתה בשנת הלימודים תשפ"ז (2026-2027)' error={errors.grade?.message} required>
                <Select dir="rtl" onValueChange={(val) => setValue("grade", val, { shouldValidate: true })}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחרו כיתה" />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADES.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldGroup>

              <FieldGroup label="ישוב המגורים של התלמיד/ה" error={errors.city?.message} required>
                <Input {...register("city")} placeholder="ישוב" />
              </FieldGroup>

              <FieldGroup label="טלפון נייד של התלמיד/ה">
                <Input {...register("studentPhone")} type="tel" placeholder="050-0000000" />
              </FieldGroup>
            </CardContent>
          </Card>

          {/* Learning Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">פרטי לימודים מבוקשים</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldGroup label="הכלי המבוקש" error={errors.requestedInstruments?.message} required>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {instruments.map((inst) => (
                    <label
                      key={inst.id}
                      className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                        selectedInstruments.includes(inst.name)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={selectedInstruments.includes(inst.name)}
                        onCheckedChange={() => toggleInstrument(inst.name)}
                      />
                      <span className="text-sm">{inst.name}</span>
                    </label>
                  ))}
                </div>
              </FieldGroup>

              <FieldGroup label="משך שיעור מבוקש" error={errors.requestedLessonDuration?.message} required>
                <div className="flex flex-col gap-2">
                  {LESSON_DURATION_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" value={opt.value} {...register("requestedLessonDuration")} className="accent-primary" />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          {/* Parent Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">פרטי הורה</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldGroup label="שם מלא הורה" error={errors.parentName?.message} required>
                <Input {...register("parentName")} placeholder="שם מלא" />
              </FieldGroup>

              <FieldGroup label="תעודת זהות הורה" error={errors.parentNationalId?.message} required>
                <Input {...register("parentNationalId")} placeholder="מספר תעודת זהות" />
              </FieldGroup>

              <FieldGroup label="טלפון נייד הורה" error={errors.parentPhone?.message} required>
                <Input {...register("parentPhone")} type="tel" placeholder="050-0000000" />
              </FieldGroup>

              <FieldGroup label='דוא"ל הורה' error={errors.parentEmail?.message} required>
                <Input {...register("parentEmail")} type="email" placeholder="email@example.com" dir="ltr" className="text-left" />
              </FieldGroup>
            </CardContent>
          </Card>

          {/* Submit */}
          {submitError && (
            <div className="text-sm text-destructive text-center bg-destructive/10 p-3 rounded-lg">{submitError}</div>
          )}

          <Button type="submit" size="lg" className="w-full text-lg h-14" disabled={submitting}>
            {submitting ? "שולח..." : "שליחת הרשמה"}
          </Button>
        </form>
      </div>
    </div>
  );
};

/* Reusable field wrapper */
const FieldGroup = ({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <Label className="text-sm font-medium">
      {label}
      {required && <span className="text-destructive mr-1">*</span>}
    </Label>
    {children}
    {error && <p className="text-sm text-destructive">{error}</p>}
  </div>
);

export default PublicRegistration;
