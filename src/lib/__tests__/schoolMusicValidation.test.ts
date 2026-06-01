import { describe, it, expect } from "vitest";
import {
  isExactDigits,
  isValidEmail,
  validateSchoolMusicField,
} from "@/lib/schoolMusicValidation";

// ─── isExactDigits ───────────────────────────────────────────────────────────

describe("isExactDigits", () => {
  it("9 ספרות תקינות — עובר", () => {
    expect(isExactDigits("123456789", 9)).toBe(true);
  });

  it("10 ספרות לטלפון — עובר", () => {
    expect(isExactDigits("0521234567", 10)).toBe(true);
  });

  it("פחות מ-9 ספרות — נכשל", () => {
    expect(isExactDigits("12345678", 9)).toBe(false);
  });

  it("יותר מ-9 ספרות — נכשל", () => {
    expect(isExactDigits("1234567890", 9)).toBe(false);
  });

  it("מקפים מנורמלים לפני בדיקה", () => {
    expect(isExactDigits("123-456-789", 9)).toBe(true);
  });

  it("מחרוזת ריקה — נכשל", () => {
    expect(isExactDigits("", 9)).toBe(false);
  });

  it("אותיות — נכשל", () => {
    expect(isExactDigits("abcdefghi", 9)).toBe(false);
  });
});

// ─── isValidEmail ─────────────────────────────────────────────────────────────

describe("isValidEmail", () => {
  it("אימייל תקין", () => {
    expect(isValidEmail("parent@example.com")).toBe(true);
  });

  it("אימייל עם נקודה בשם", () => {
    expect(isValidEmail("first.last@school.co.il")).toBe(true);
  });

  it("אימייל עם רווחים בצדדים — עובר (trim)", () => {
    expect(isValidEmail("  parent@example.com  ")).toBe(true);
  });

  it("בלי @", () => {
    expect(isValidEmail("parentexample.com")).toBe(false);
  });

  it("בלי דומיין", () => {
    expect(isValidEmail("parent@")).toBe(false);
  });

  it("מחרוזת ריקה", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("רק @", () => {
    expect(isValidEmail("@")).toBe(false);
  });
});

// ─── validateSchoolMusicField ─────────────────────────────────────────────────

describe("validateSchoolMusicField", () => {
  describe("שדות חובה בסיסיים", () => {
    it("בית ספר ריק — שדה חובה", () => {
      expect(validateSchoolMusicField("school_music_school_id", "")).toBe("שדה חובה");
    });

    it("בית ספר עם ערך — תקין", () => {
      expect(validateSchoolMusicField("school_music_school_id", "some-id")).toBeNull();
    });

    it("שם פרטי ריק — שדה חובה", () => {
      expect(validateSchoolMusicField("student_first_name", "")).toBe("שדה חובה");
    });

    it("שם פרטי עם רווחים בלבד — שדה חובה", () => {
      expect(validateSchoolMusicField("student_first_name", "   ")).toBe("שדה חובה");
    });

    it("שם פרטי תקין", () => {
      expect(validateSchoolMusicField("student_first_name", "ישראל")).toBeNull();
    });
  });

  describe("תעודת זהות תלמיד", () => {
    it("ריק — שדה חובה", () => {
      expect(validateSchoolMusicField("student_national_id", "")).toBe("שדה חובה");
    });

    it("פחות מ-9 ספרות — שגיאת ולידציה", () => {
      expect(validateSchoolMusicField("student_national_id", "12345678")).toBe("תעודת זהות חייבת להיות 9 ספרות");
    });

    it("9 ספרות תקינות — עובר", () => {
      expect(validateSchoolMusicField("student_national_id", "123456789")).toBeNull();
    });

    it("9 ספרות עם מקפים — עובר", () => {
      expect(validateSchoolMusicField("student_national_id", "123-456-789")).toBeNull();
    });
  });

  describe("טלפון הורה", () => {
    it("ריק — שדה חובה", () => {
      expect(validateSchoolMusicField("parent_phone", "")).toBe("שדה חובה");
    });

    it("פחות מ-10 ספרות — שגיאת ולידציה", () => {
      expect(validateSchoolMusicField("parent_phone", "052123456")).toBe("מספר טלפון חייב להיות 10 ספרות");
    });

    it("10 ספרות תקינות — עובר", () => {
      expect(validateSchoolMusicField("parent_phone", "0521234567")).toBeNull();
    });
  });

  describe("אימייל הורה", () => {
    it("ריק — שדה חובה", () => {
      expect(validateSchoolMusicField("parent_email", "")).toBe("שדה חובה");
    });

    it("אימייל לא תקין — שגיאת ולידציה", () => {
      expect(validateSchoolMusicField("parent_email", "notanemail")).toBe("יש להזין אימייל תקין");
    });

    it("אימייל תקין — עובר", () => {
      expect(validateSchoolMusicField("parent_email", "parent@example.com")).toBeNull();
    });
  });

  describe("שדה לא מוכר", () => {
    it("שדה לא מוכר — מחזיר null", () => {
      expect(validateSchoolMusicField("some_unknown_field", "")).toBeNull();
    });
  });
});
