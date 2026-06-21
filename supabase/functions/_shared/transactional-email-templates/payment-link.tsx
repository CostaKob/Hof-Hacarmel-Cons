import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
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
  amount?: string | number
  paymentUrl?: string
}

const Email = ({
  parentName = '',
  studentName = '',
  yearName = '',
  amount = '',
  paymentUrl = '',
}: Props) => {
  const formattedAmount =
    typeof amount === 'number'
      ? `₪${amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : amount

  return (
    <Html lang="he" dir="rtl">
      <Head />
      <Preview>
        קישור לתשלום שכר לימוד{yearName ? ` ${yearName}` : ''} — {studentName}
      </Preview>
      <Body style={main}>
        <Container style={container} dir="rtl">
          <Heading style={h1}>קישור לתשלום שכר לימוד</Heading>
          <Text style={p}>שלום {parentName},</Text>
          <Text style={p}>
            מצורף קישור לתשלום שכר הלימוד עבור <strong>{studentName}</strong>
            {yearName ? <> לשנת הלימודים <strong>{yearName}</strong></> : null}.
          </Text>

          <Section style={card} dir="rtl">
            <Text style={amountLabel}>סכום לתשלום</Text>
            <Text style={amountValue}>{formattedAmount}</Text>
          </Section>

          {paymentUrl ? (
            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button href={paymentUrl} style={ctaButton}>
                לתשלום באתר
              </Button>
              <Text style={{ fontSize: '13px', color: '#666', marginTop: '12px' }}>
                או לחץ על הקישור:{' '}
                <Link href={paymentUrl} style={link}>
                  {paymentUrl}
                </Link>
              </Text>
            </Section>
          ) : null}

          <Text style={p}>
            הקישור מאובטח ומיועד לשימוש אישי. אין להעבירו לאחרים.
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
            בברכה,
            <br />
            אולפן ומגמת המוסיקה חוף הכרמל
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (data: any) =>
    `קישור לתשלום שכר לימוד${data?.yearName ? ` ${data.yearName}` : ''} — ${data?.studentName || ''}`,
  displayName: 'קישור תשלום להורה',
  previewData: {
    parentName: 'שרה ישראלי',
    studentName: 'דניאל ישראלי',
    yearName: 'תשפ"ו',
    amount: 3450,
    paymentUrl: 'https://app.icount.co.il/m/abc123',
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
const container = {
  maxWidth: '600px',
  margin: '0 auto',
  textAlign: 'right' as const,
  direction: 'rtl' as const,
}
const h1 = {
  fontSize: '20px',
  margin: '0 0 16px',
  textAlign: 'right' as const,
}
const p = {
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 16px',
  textAlign: 'right' as const,
}
const card = {
  background: '#f8fafc',
  borderRadius: '12px',
  padding: '20px',
  margin: '16px 0',
  textAlign: 'right' as const,
  border: '1px solid #e2e8f0',
}
const amountLabel = {
  fontSize: '14px',
  color: '#666',
  margin: '0 0 4px',
  textAlign: 'right' as const,
}
const amountValue = {
  fontSize: '28px',
  fontWeight: 700,
  color: '#0f172a',
  margin: 0,
  textAlign: 'right' as const,
}
const ctaButton = {
  backgroundColor: '#3b82f6',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 600,
  padding: '14px 28px',
  borderRadius: '10px',
  textDecoration: 'none',
  display: 'inline-block',
  textAlign: 'center' as const,
}
const contactBox = { margin: '16px 0', textAlign: 'right' as const }
const contactHeading = { fontSize: '15px', fontWeight: 600, margin: '0 0 8px', textAlign: 'right' as const }
const contactLine = { fontSize: '14px', lineHeight: '1.6', margin: '4px 0', textAlign: 'right' as const }
const link = { color: '#2563eb', textDecoration: 'underline' }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '14px', color: '#666', margin: 0, textAlign: 'right' as const }
