import { test, expect } from "@playwright/test";

// ─── קבועים ──────────────────────────────────────────────────────────────────
// הגדר את הפרטים ב-.env.test:
//   ADMIN_EMAIL, ADMIN_PASSWORD
//   TEACHER_EMAIL, TEACHER_PASSWORD

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? "";
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD ?? "";

// ─── לוגין ────────────────────────────────────────────────────────────────────

test.describe("לוגין", () => {
  test("כניסה כמנהל — מנותב ל-/admin", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/אימייל|דוא/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/סיסמה|סיסמא/i).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /כניסה|התחבר/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });
  });

  test("כניסה כמורה — מנותב ל-/teacher", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/אימייל|דוא/i).fill(TEACHER_EMAIL);
    await page.getByLabel(/סיסמה|סיסמא/i).fill(TEACHER_PASSWORD);
    await page.getByRole("button", { name: /כניסה|התחבר/i }).click();
    await expect(page).toHaveURL(/\/teacher/, { timeout: 10_000 });
  });

  test("פרטים שגויים — מוצגת שגיאה", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/אימייל|דוא/i).fill("wrong@example.com");
    await page.getByLabel(/סיסמה|סיסמא/i).fill("wrongpassword");
    await page.getByRole("button", { name: /כניסה|התחבר/i }).click();
    await expect(page.getByRole("alert").or(page.locator("[data-error]"))).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("גישה ל-/admin ללא לוגין — מנותב ל-/login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
  });

  test("גישה ל-/teacher ללא לוגין — מנותב ל-/login", async ({ page }) => {
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
  });
});
