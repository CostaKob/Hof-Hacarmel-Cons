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

interface LineItem {
  label: string
  amount?: number | string
}

interface Props {
  moduleLabel?: string
  studentName?: string
  studentNationalId?: string
  parentName?: string
  parentPhone?: string
  parentEmail?: string
  yearName?: string
  schoolName?: string
  amount?: number | string
  paymentMethod?: string
  installments?: number | string
  docNumber?: string
  invoiceUrl?: string
  transactionId?: string
  paidAt?: string
  notes?: string
  items?: LineItem[]
  adminUrl?: string
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

const money = (v?: number | string) => {
  if (v === undefined || v === null || v === '') return ''
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  return `₪${n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const Email = ({
  moduleLabel = 'תלמידי מוסיקה',
  studentName = '',
  studentNationalId = '',
  parentName = '',
  parentPhone = '',
  parentEmail = '',
  yearName = '',
  schoolName = '',
  amount = '',
  paymentMethod = 'כרטיס אשראי',
  installments = '',
  docNumber = '',
  invoiceUrl = '',
  transactionId = '',
  paidAt = '',
  notes = '',
  items = [],
  adminUrl = 'https://musichof.com',
}: Props) => {
  return (
    <Html lang="he" dir="rtl">
      <Head />
      <Preview>התקבל תשלום: {studentName} {money(amount)}</Preview>
      <Body style={main}>
        <Container style={container} dir="rtl">
          <Heading style={h1}>💳 התקבל תשלום</Heading>
          <Text style={p}>
            התקבל תשלום בסך <strong>{money(amount)}</strong>
            {studentName ? <> עבור <strong>{studentName}</strong></> : null}
            {yearName ? <> לשנת <strong>{yearName}</strong></> : null}.
          </Text>

          <Section style={card} dir="rtl">
            <Heading as="h2" style={h2}>פרטי התשלום</Heading>
            <Row label="סכום" value={money(amount)} />
            <Row label="אמצעי תשלום" value={paymentMethod} />
            <Row label="תשלומים" value={installments && Number(installments) > 1 ? installments : ''} />
            <Row label="מספר קבלה" value={docNumber} />
            <Row label="מזהה עסקה" value={transactionId} />
            <Row label="מועד" value={paidAt} />
            <Row label="מודול" value={moduleLabel} />
            <Row label="הערות" value={notes} />
          </Section>

          {items.length > 0 && (
            <Section style={card} dir="rtl">
              <Heading as="h2" style={h2}>פירוט</Heading>
              {items.map((it, i) => (
                <Row key={i} label={it.label} value={money(it.amount)} />
              ))}
            </Section>
          )}

          <Section style={card} dir="rtl">
            <Heading as="h2" style={h2}>פרטי תלמיד/ה והורה</Heading>
            <Row label="תלמיד/ה" value={studentName} />
            <Row label="ת.ז." value={studentNationalId} />
            <Row label="בית ספר" value={schoolName} />
            <Row label="הורה" value={parentName} />
            <Row label="טלפון" value={parentPhone} />
            <Row label='דוא"ל' value={parentEmail} />
          </Section>

          <Hr style={hr} />

          <Section style={{ textAlign: 'center', marginTop: '16px' }}>
            {invoiceUrl && (
              <Link href={invoiceUrl} style={button}>
                צפייה בקבלה
              </Link>
            )}
            {' '}
            <Link href={adminUrl} style={buttonSecondary}>
              פתיחת המערכת
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
    `[תשלום התקבל] ${data?.studentName || ''} — ${money(data?.amount)}`.trim(),
  displayName: 'הודעת מנהל — תשלום התקבל',
  previewData: {
    studentName: 'ישראל ישראלי',
    studentNationalId: '123456782',
    parentName: 'שרה ישראלי',
    parentPhone: '0521234567',
    parentEmail: 'test@example.com',
    yearName: 'תשפ״ז',
    amount: 1250,
    installments: 3,
    docNumber: '10231',
    invoiceUrl: 'https://example.com/receipt.pdf',
    transactionId: '9988776',
    paidAt: '11/08/2026 15:04',
    items: [
      { label: 'פסנתר — 45 דק׳', amount: 900 },
      { label: 'גיטרה — 30 דק׳', amount: 350 },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px', margin: '0 auto' }
const h1 = { color: '#047857', fontSize: '22px', margin: '0 0 16px 0' }
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
const hr = { borderColor: '#e2e8f0', margin: '20px 0' }
const button = {
  backgroundColor: '#047857',
  color: '#ffffff',
  padding: '10px 20px',
  borderRadius: '10px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 600,
  display: 'inline-block',
}
const buttonSecondary = {
  backgroundColor: '#e2e8f0',
  color: '#0f172a',
  padding: '10px 20px',
  borderRadius: '10px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 600,
  display: 'inline-block',
}
