import { test, expect, type Page } from "@playwright/test";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function waitForForm(page: Page) {
  await expect(page.getByRole("button", { name: /שליחת הרשמה/i })).toBeVisible({
    timeout: 15_000,
  });
}

// ─── טופס הרשמה ציבורי ────────────────────────────────────────────────────────

test.describe("טופס הרשמה ציבורי (/register)", () => {
  test("הטופס נטען — כפתור שליחה גלוי", async ({ page }) => {
    await page.goto("/register");
    await waitForForm(page);
  });

  test("שליחה ללא מילוי — מוצגות שגיאות חובה", async ({ page }) => {
    await page.goto("/register");
    await waitForForm(page);
    await page.getByRole("button", { name: /שליחת הרשמה/i }).click();
    const errors = page.locator("p.text-destructive, [data-error]");
    await expect(errors.first()).toBeVisible({ timeout: 3_000 });
  });

  test("שליחה ללא אישור תנאים — שגיאת אישור", async ({ page }) => {
    await page.goto("/register");
    await waitForForm(page);
    await page.getByRole("button", { name: /שליחת הרשמה/i }).click();
    await expect(page.getByText(/יש לאשר את תנאי ההרשמה/i)).toBeVisible({ timeout: 3_000 });
  });

  test("ת.ז. עם פחות מ-9 ספרות — שגיאת ולידציה", async ({ page }) => {
    await page.goto("/register");
    await waitForForm(page);
    const idField = page.locator('[data-field-key="student_national_id"] input');
    if (!(await idField.isVisible())) { test.skip(); return; }
    await idField.fill("12345");
    await idField.blur();
    await expect(page.getByText(/9 ספרות/i)).toBeVisible({ timeout: 3_000 });
  });

  test("טלפון שלא מתחיל ב-05 — שגיאת ולידציה", async ({ page }) => {
    await page.goto("/register");
    await waitForForm(page);
    const phoneField = page.locator('[data-field-key="parent_phone"] input');
    if (!(await phoneField.isVisible())) { test.skip(); return; }
    await phoneField.fill("031234567");
    await phoneField.blur();
    await expect(page.getByText(/05/i).or(page.getByText(/נייד/i))).toBeVisible({ timeout: 3_000 });
  });

  test("ת.ז. לא קיימת — אין בנר תלמיד קיים", async ({ page }) => {
    await page.goto("/register");
    await waitForForm(page);
    const idField = page.locator('[data-field-key="student_national_id"] input');
    if (!(await idField.isVisible())) { test.skip(); return; }
    await idField.fill("000000000");
    await page.waitForTimeout(800); // debounce
    await expect(page.getByText(/תלמיד.* קיים/i)).not.toBeVisible({ timeout: 2_000 });
  });

  test("הרשמה בסיסית מוצלחת — מוצג מסך הצלחה", async ({ page }) => {
    await page.goto("/register");
    await waitForForm(page);

    // אישור תנאים
    await page.locator('button[role="checkbox"]').first().click();

    // שם
    const nameField = page.locator('[data-field-key="student_full_name"] input');
    if (await nameField.isVisible()) await nameField.fill("ישראל ישראלי");

    // ת.ז. (9 ספרות תקינה)
    const idField = page.locator('[data-field-key="student_national_id"] input');
    if (await idField.isVisible()) await idField.fill("123456782");

    // טלפון הורה
    const parentPhone = page.locator('[data-field-key="parent_phone"] input');
    if (await parentPhone.isVisible()) await parentPhone.fill("0521234567");

    // שם הורה
    const parentName = page.locator('[data-field-key="parent_name"] input');
    if (await parentName.isVisible()) await parentName.fill("שרה ישראלי");

    // אימייל הורה
    const parentEmail = page.locator('[data-field-key="parent_email"] input');
    if (await parentEmail.isVisible()) await parentEmail.fill("test@example.com");

    // כלי (multiselect — בחירה ראשונה)
    const firstInstrument = page.locator('[data-field-key="requested_instruments"] label').first();
    if (await firstInstrument.isVisible()) await firstInstrument.click();

    // שלוחה
    const branchSelect = page.locator('[data-field-key="branch_school_name"] button[role="combobox"]');
    if (await branchSelect.isVisible()) {
      await branchSelect.click();
      await page.getByRole("option").first().click();
    }

    await page.getByRole("button", { name: /שליחת הרשמה/i }).click();
    await expect(page.getByText(/ההרשמה נקלטה בהצלחה/i)).toBeVisible({ timeout: 10_000 });
  });
});

// ─── מצבי שגיאה ──────────────────────────────────────────────────────────────

test.describe("מצבי שגיאה בטופס הרשמה", () => {
  test("yearId לא קיים — מוצגת הודעה מתאימה", async ({ page }) => {
    await page.goto("/register?yearId=00000000-0000-0000-0000-000000000000");
    await expect(page.getByText(/אינו פעיל|לא פעיל|סגור/i)).toBeVisible({ timeout: 10_000 });
  });
});
