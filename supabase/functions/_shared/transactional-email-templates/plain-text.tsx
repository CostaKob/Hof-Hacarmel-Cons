import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Html, Link, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  body?: string
  subject?: string
}

// Supports markdown-style links: [לחצו כאן לתשלום](https://...) and bare URLs
const TOKEN_RE = /(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))|(https?:\/\/[^\s]+)/g

const renderLine = (line: string) => {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const re = new RegExp(TOKEN_RE)
  let key = 0
  while ((match = re.exec(line)) !== null) {
    if (match.index > lastIndex) parts.push(line.slice(lastIndex, match.index))
    if (match[1]) {
      const inner = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(match[1])
      if (inner) {
        const isPaymentLink = inner[1] === 'לחצו כאן לתשלום'
        parts.push(
          <Link key={`l${key++}`} href={inner[2]} style={isPaymentLink ? paymentLinkStyle : linkStyle}>
            {inner[1]}
          </Link>
        )
      } else {
        parts.push(match[1])
      }
    } else if (match[2]) {
      parts.push(
        <Link key={`u${key++}`} href={match[2]} style={linkStyle}>
          {match[2]}
        </Link>
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < line.length) parts.push(line.slice(lastIndex))
  return parts.length > 0 ? parts : line
}

const Email = ({ body = '' }: Props) => (
  <Html lang="he" dir="rtl">
    <Head>
      <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
    </Head>
    <Preview>{(body || '').slice(0, 120)}</Preview>
    <Body style={main}>
      <Container style={container} dir="rtl">
        {body.split('\n').map((line, i) => {
          const hl = line.startsWith('[[HL]]')
          const text = hl ? line.slice(6) : line
          return (
            <Text key={i} style={hl ? highlightStyle : lineStyle} dir="rtl">
              {text.length === 0 ? '\u00A0' : renderLine(text)}
            </Text>
          )
        })}
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
const highlightStyle = { margin: '0', fontSize: '17px', lineHeight: '26px', color: '#dc2626', fontWeight: 'bold' as const, textAlign: 'right' as const, direction: 'rtl' as const, unicodeBidi: 'plaintext' as const }
const linkStyle = { color: '#0f766e', fontWeight: 'bold' as const, textDecoration: 'underline', fontSize: '14px' }
const paymentLinkStyle = { color: '#0f766e', fontWeight: 'bold' as const, textDecoration: 'underline', fontSize: '18px' }
