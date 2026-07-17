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
  studentName?: string
  studentNationalId?: string
  parentName?: string
  parentPhone?: string
  parentEmail?: string
  yearName?: string
  branch?: string
  instruments?: string[]
  lessonDuration?: string | number
  grade?: string
  city?: string
  studentPhone?: string
  studentSchool?: string
  notes?: string
  wantsMusicProduction?: boolean
  wantsRecitalTrack?: boolean
  submittedAt?: string
  registrationUrl?: string
}

const Row = ({ label, value }: { label: string; value?: React.ReactNode }) => {
  if (value === undefined || value === null || value === '') return null
  return (
    <Text style={rowText}>
      <span style={rowLabel}>{label}: </span>
      <span>{value}</span>
    </Text>
  )
}

const Email = ({
  studentName = '',
  studentNationalId = '',
  parentName = '',
  parentPhone = '',
  parentEmail = '',
  yearName = '',
  branch = '',
  instruments = [],
  lessonDuration = '',
  grade = '',
  city = '',
  studentPhone = '',
  studentSchool = '',
  notes = '',
  wantsMusicProduction = false,
  wantsRecitalTrack = false,
  submittedAt = '',
  registrationUrl = 'https://musichof.com',
}: Props) => {
  const instrumentsLabel = instruments.length > 1 ? 'כלים מבוקשים' : 'כלי מבוקש'
  const tracks: string[] = []
  if (wantsMusicProduction) tracks.push('הפקה מוסיקלית')
  if (wantsRecitalTrack) tracks.push('מסלול לרסיטל')

  return (
    <Html lang="he" dir="rtl">
      <Head />
      <Preview>הרשמה חדשה: {studentName}</Preview>
      <Body style={main}>
        <Container style={container} dir="rtl">
          <Heading style={h1}>🎵 הרשמה חדשה התקבלה</Heading>
          <Text style={p}>
            התקבלה הרשמה חדשה במערכת עבור <strong>{studentName}</strong>
            {yearName ? <> לשנת הלימודים <strong>{yearName}</strong></> : null}.
          </Text>

          <Section style={card} dir="rtl">
            <Heading as="h2" style={h2}>פרטי תלמיד/ה</Heading>
            <Row label="שם" value={studentName} />
            <Row label="ת.ז." value={studentNationalId} />
            <Row label="כיתה" value={grade} />
            <Row label="ישוב מגורים" value={city} />
            <Row label="בית ספר" value={studentSchool} />
            <Row label="טלפון תלמיד/ה" value={studentPhone} />
          </Section>

          <Section style={card} dir="rtl">
            <Heading as="h2" style={h2}>לימודים מבוקשים</Heading>
            <Row label="שלוחה" value={branch} />
            <Row label={instrumentsLabel} value={instruments.join(', ')} />
            <Row label="משך שיעור" value={lessonDuration ? `${lessonDuration} דקות` : ''} />
            {tracks.length > 0 && <Row label="מסלולים מיוחדים" value={tracks.join(', ')} />}
          </Section>

          <Section style={card} dir="rtl">
            <Heading as="h2" style={h2}>פרטי הורה</Heading>
            <Row label="שם" value={parentName} />
            <Row label="טלפון" value={parentPhone} />
            <Row label='דוא"ל' value={parentEmail} />
          </Section>

          {notes && (
            <Section style={card} dir="rtl">
              <Heading as="h2" style={h2}>הערות</Heading>
              <Text style={notesText}>{notes}</Text>
            </Section>
          )}

          <Hr style={hr} />

          <Text style={muted}>נשלח בתאריך: {submittedAt}</Text>

          <Section style={{ textAlign: 'center', marginTop: '24px' }}>
            <Link href={`${registrationUrl}/admin/registrations`} style={button}>
              פתיחת רשימת ההרשמות במערכת
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (data: Props) =>
    `[הרשמה חדשה] ${data?.studentName || 'תלמיד/ה'}${data?.branch ? ` — ${data.branch}` : ''}`,
  displayName: 'הודעת מנהל — הרשמה חדשה',
  previewData: {
    studentName: 'ישראל ישראלי',
    studentNationalId: '123456782',
    parentName: 'שרה ישראלי',
    parentPhone: '0521234567',
    parentEmail: 'test@example.com',
    yearName: 'תשפ״ז',
    branch: 'כרם מהר״ל',
    instruments: ['פסנתר', 'גיטרה'],
    lessonDuration: '45',
    grade: 'ז',
    city: 'עתלית',
    studentPhone: '0501234567',
    studentSchool: 'ממ״ד עתלית',
    submittedAt: '17/07/2026 14:30',
    wantsRecitalTrack: true,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px', margin: '0 auto' }
const h1 = { color: '#0369a1', fontSize: '22px', margin: '0 0 16px 0' }
const h2 = { color: '#0f172a', fontSize: '15px', margin: '0 0 10px 0', fontWeight: 600 }
const p = { color: '#334155', fontSize: '14px', lineHeight: '22px', margin: '0 0 12px 0' }
const card = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '14px 16px',
  margin: '0 0 12px 0',
}
const rowText = { color: '#0f172a', fontSize: '14px', margin: '4px 0', lineHeight: '20px' }
const rowLabel = { color: '#64748b', fontWeight: 600 }
const notesText = { color: '#0f172a', fontSize: '14px', whiteSpace: 'pre-wrap' as const, margin: 0 }
const hr = { borderColor: '#e2e8f0', margin: '20px 0' }
const muted = { color: '#94a3b8', fontSize: '12px', margin: 0, textAlign: 'center' as const }
const button = {
  backgroundColor: '#0369a1',
  color: '#ffffff',
  padding: '10px 20px',
  borderRadius: '10px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 600,
  display: 'inline-block',
}
