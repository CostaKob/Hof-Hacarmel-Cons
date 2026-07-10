import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  body?: string
  subject?: string
}

const Email = ({ body = '' }: Props) => (
  <Html lang="he" dir="rtl">
    <Head>
      <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
    </Head>
    <Preview>{(body || '').slice(0, 120)}</Preview>
    <Body style={main}>
      <Container style={container} dir="rtl">
        {body.split('\n').map((line, i) => (
          <Text key={i} style={lineStyle} dir="rtl">
            {line.length === 0 ? '\u00A0' : line}
          </Text>
        ))}
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: any) => (data?.subject as string) || 'הודעה',
  displayName: 'Plain text message',
  previewData: { subject: 'הודעה', body: 'שלום,\nזוהי הודעת בדיקה.' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', direction: 'rtl' as const, textAlign: 'right' as const }
const container = { padding: '20px 25px', direction: 'rtl' as const, textAlign: 'right' as const, maxWidth: '600px', margin: '0 auto' }
const lineStyle = { margin: '0', fontSize: '14px', lineHeight: '22px', color: '#1f2937', textAlign: 'right' as const, direction: 'rtl' as const, unicodeBidi: 'plaintext' as const }
