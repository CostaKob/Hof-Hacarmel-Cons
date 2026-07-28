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
  subject?: string
  body?: string
  parentName?: string
}

const Email = ({ subject = 'הודעה', body = '', parentName = '' }: Props) => {
  const lines = (body || '').split('\n')
  return (
    <Html lang="he" dir="rtl">
      <Head>
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
      </Head>
      <Preview>{subject}</Preview>
      <Body style={main}>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} dir="rtl" style={{ direction: 'rtl' }}>
          <tbody>
            <tr>
              <td align="right" dir="rtl" style={{ direction: 'rtl', textAlign: 'right' }}>
                <Container style={container} dir="rtl">
                  <Heading style={h1}>אולפן ומגמת המוסיקה חוף הכרמל</Heading>
                  <Hr style={hr} />
                  {subject ? <Heading style={h2}>{subject}</Heading> : null}
                  {parentName ? <Text style={p}>שלום {parentName},</Text> : null}

                  <Section style={{ margin: '8px 0 16px' }} dir="rtl">
                    {lines.map((line, i) => (
                      <Text key={i} style={lineStyle} dir="rtl">
                        {line.length === 0 ? '\u00A0' : line}
                      </Text>
                    ))}
                  </Section>

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
              </td>
            </tr>
          </tbody>
        </table>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (data: any) => (data?.subject as string) || 'הודעה מאולפן המוסיקה חוף הכרמל',
  displayName: 'הודעה כללית להורים',
  previewData: {
    subject: 'עדכון לגבי שיבוץ מורים',
    parentName: 'שרה ישראלי',
    body: 'שלום רב,\nאנחנו בעיצומו של תהליך שיבוץ התלמידים למורים.\nבמהלך חודש אוגוסט ניצור עמכם קשר.',
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
const h1 = { fontSize: '20px', margin: '0 0 8px', textAlign: 'right' as const, color: '#1a1a1a' }
const h2 = { fontSize: '17px', margin: '12px 0', textAlign: 'right' as const, color: '#1a1a1a' }
const p = { fontSize: '15px', lineHeight: '1.6', margin: '0 0 12px', textAlign: 'right' as const }
const lineStyle = {
  margin: '0',
  fontSize: '15px',
  lineHeight: '24px',
  color: '#1f2937',
  textAlign: 'right' as const,
  direction: 'rtl' as const,
  unicodeBidi: 'plaintext' as const,
}
const contactBox = { margin: '16px 0', textAlign: 'right' as const }
const contactHeading = { fontSize: '15px', fontWeight: 600, margin: '0 0 8px', textAlign: 'right' as const }
const contactLine = { fontSize: '14px', lineHeight: '1.6', margin: '4px 0', textAlign: 'right' as const }
const link = { color: '#2563eb', textDecoration: 'underline' }
const hr = { borderColor: '#eee', margin: '16px 0' }
const footer = { fontSize: '14px', color: '#666', margin: 0, textAlign: 'right' as const }
