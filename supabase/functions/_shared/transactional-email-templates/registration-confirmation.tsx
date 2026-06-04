import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  parentName?: string
  studentName?: string
  yearName?: string
  branch?: string
  instruments?: string[]
  lessonDuration?: string | number
  submittedAt?: string
  approvalText?: string
  sectionsText?: string
}

const Email = ({
  parentName = '',
  studentName = '',
  yearName = '',
  branch = '',
  instruments = [],
  lessonDuration = '',
  submittedAt = '',
  approvalText = 'קראתי את המידע ואני מאשר/ת את תנאי ההרשמה והלימודים',
  sectionsText = '',
}: Props) => {
  const instrumentsLabel = instruments.length > 1 ? 'כלים מבוקשים' : 'כלי מבוקש'
  return (
    <Html lang="he" dir="rtl">
      <Head />
      <Preview>אישור הרשמה — אולפן ומגמת המוסיקה חוף הכרמל</Preview>
      <Body style={main}>
        <Container style={container} dir="rtl">
          <Heading style={h1}>אישור הרשמה — אולפן ומגמת המוסיקה חוף הכרמל</Heading>
          <Text style={p}>שלום {parentName},</Text>
          <Text style={p}>
            קיבלנו את טופס ההרשמה עבור <strong>{studentName}</strong>
            {yearName ? <> לשנת הלימודים <strong>{yearName}</strong></> : null}.
          </Text>

          <Section style={card} dir="rtl">
            <Row label="תאריך מילוי" value={submittedAt} />
            <Row label="שלוחה" value={branch} />
            <Row label={instrumentsLabel} value={instruments.join(', ')} />
            <Row label="משך שיעור" value={lessonDuration ? `${lessonDuration} דקות` : ''} />
          </Section>

          {/* תקנון מלא אם קיים */}
          {sectionsText ? (
            <Section style={approvalBox} dir="rtl">
              <Text style={approvalCaption}>תקנון ותנאי ההרשמה:</Text>
              <Text style={approvalBody}>{sectionsText}</Text>
            </Section>
          ) : null}

          <Section style={approvalBox} dir="rtl">
            <Text style={approvalCaption}>אישור ההורה:</Text>
            <Text style={approvalBody}>{approvalText}</Text>
          </Section>

          <Text style={p}>
            אישרת את האמור לעיל בלחיצה על תיבת הסימון בתאריך {submittedAt}.
            אישור זה מהווה תיעוד של הסכמתך לתנאי ההרשמה והלימודים.
          </Text>

          <Hr style={hr} />

          <Section style={contactBox} dir="rtl">
            <Text style={contactHeading}>פרטי קשר</Text>
            <Text style={contactLine}>
              מייל:{' '}
              <Link href="mailto:musichof@gmail.com" style={link}>
                musichof@gmail.com
              </Link>
            </Text>
            <Text style={contactLine}>טלפון משרד: 04-6299711</Text>
            <Text style={contactLine}>קורין: 054-7467498</Text>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            בברכה,<br />
            אולפן ומגמת המוסיקה חוף הכרמל
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const Row = ({ label, value }: { label: string; value?: string }) =>
  value ? (
    <div style={rowStyle}>
      <span style={rowLabel}>{label}</span>
      <span style={rowValue}>{value}</span>
    </div>
  ) : null

export const template = {
  component: Email,
  subject: (data: any) =>
    `אישור הרשמה — אולפן ומגמת המוסיקה חוף הכרמל${data?.yearName ? ` ${data.yearName}` : ''}`,
  displayName: 'אישור הרשמה להורה',
  previewData: {
    parentName: 'שרה ישראלי',
    studentName: 'דניאל ישראלי',
    yearName: 'תשפ״ז',
    branch: 'העמר',
    instruments: ['גיטרה קלאסית'],
    lessonDuration: '45',
    submittedAt: '04/06/2026 11:30',
    approvalText: 'קראתי את המידע ואני מאשר/ת את תנאי ההרשמה והלימודים',
    sectionsText: '',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Arial, sans-serif',
  color: '#1a1a1a',
  margin: 0,
  padding: '24px',
  direction: 'rtl' as const,
  textAlign: 'right' as const,
}
const container = { maxWidth: '600px', margin: '0 auto', textAlign: 'right' as const, direction: 'rtl' as const }
const h1 = { fontSize: '20px', margin: '0 0 16px', textAlign: 'right' as const }
const p = { fontSize: '15px', lineHeight: '1.6', margin: '0 0 16px', textAlign: 'right' as const }
const card = { margin: '16px 0', fontSize: '14px', textAlign: 'right' as const }
const rowStyle = { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee', direction: 'rtl' as const }
const rowLabel = { color: '#666' }
const rowValue = { fontWeight: 600 }
const approvalBox = { background: '#f5f5f5', borderRadius: '8px', padding: '16px', margin: '16px 0', textAlign: 'right' as const }
const approvalCaption = { fontSize: '13px', color: '#666', margin: '0 0 8px', textAlign: 'right' as const }
const approvalBody = { fontSize: '14px', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-line' as const, textAlign: 'right' as const }
const contactBox = { margin: '16px 0', textAlign: 'right' as const }
const contactHeading = { fontSize: '15px', fontWeight: 600, margin: '0 0 8px', textAlign: 'right' as const }
const contactLine = { fontSize: '14px', lineHeight: '1.6', margin: '4px 0', textAlign: 'right' as const }
const link = { color: '#2563eb', textDecoration: 'underline' }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '14px', color: '#666', margin: 0, textAlign: 'right' as const }
