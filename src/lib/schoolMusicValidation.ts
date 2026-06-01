// Validation helpers for school music registration forms

export function isExactDigits(val: string, count: number): boolean {
  return new RegExp(`^\\d{${count}}$`).test(val.replace(/[^\d]/g, ""));
}

export function isValidEmail(val: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
}

export function validateSchoolMusicField(key: string, value: string): string | null {
  switch (key) {
    case "school_music_school_id":
    case "school_music_class_id":
    case "instrument_id":
      return !value ? "שדה חובה" : null;

    case "student_first_name":
    case "student_last_name":
    case "parent_name":
      return !value.trim() ? "שדה חובה" : null;

    case "student_national_id":
      if (!value.trim()) return "שדה חובה";
      return !isExactDigits(value, 9) ? "תעודת זהות חייבת להיות 9 ספרות" : null;

    case "parent_national_id":
      if (!value.trim()) return "שדה חובה";
      return !isExactDigits(value, 9) ? "תעודת זהות חייבת להיות 9 ספרות" : null;

    case "parent_phone":
      if (!value.trim()) return "שדה חובה";
      return !isExactDigits(value, 10) ? "מספר טלפון חייב להיות 10 ספרות" : null;

    case "parent_email":
      if (!value.trim()) return "שדה חובה";
      return !isValidEmail(value) ? "יש להזין אימייל תקין" : null;

    default:
      return null;
  }
}
