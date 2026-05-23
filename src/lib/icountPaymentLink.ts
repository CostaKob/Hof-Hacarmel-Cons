/**
 * Build an iCount hosted payment-page URL for a given school/branch.
 * - Always includes the iCount page id + school display name.
 * - When `student` is provided, prefills parent + student details so the parent
 *   doesn't have to retype them.
 */
export interface PaymentLinkSchool {
  name: string;
  icount_page_id: string | null | undefined;
}

export interface PaymentLinkStudent {
  parent_name?: string | null;
  parent_email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  national_id?: string | null;
}

export function buildIcountPaymentLink(
  school: PaymentLinkSchool,
  student?: PaymentLinkStudent | null,
): string | null {
  if (!school?.icount_page_id) return null;
  const enc = encodeURIComponent;
  const base = `https://app.icount.co.il/m/${school.icount_page_id}?school_name=${enc(school.name ?? "")}`;
  if (!student) return base;
  const parts: string[] = [base];
  if (student.parent_name) parts.push(`full_name=${enc(student.parent_name)}`);
  if (student.parent_email) parts.push(`email=${enc(student.parent_email)}`);
  const studentFullName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
  if (studentFullName) parts.push(`student_name=${enc(studentFullName)}`);
  if (student.national_id) parts.push(`student_tz=${enc(student.national_id)}`);
  return parts.join("&");
}
