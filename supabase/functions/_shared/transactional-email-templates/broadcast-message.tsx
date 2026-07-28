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
  bodyHtml?: string
  parentName?: string
}

// Allowlist sanitizer for admin-authored rich text produced by the RTE.
// Keeps common formatting/structure tags, strips scripts, event handlers,
// dangerous URLs, and unknown attributes.
const ALLOWED_TAGS = new Set([
  'a','b','strong','i','em','u','s','strike','br','p','div','span',
  'ul','ol','li','h1','h2','h3','h4','h5','h6','blockquote','hr',
  'table','thead','tbody','tr','td','th','pre','code',
])
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href','title','target','rel']),
  '*': new Set(['style','dir','align']),
}
const SAFE_URL = /^(https?:|mailto:|tel:|#|\/)/i

const sanitizeHtml = (raw: string): string => {
  if (!raw) return ''
  // Remove script/style/iframe blocks entirely (content included)
  let out = raw
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?\s*>/gi, '')
  // Strip HTML comments
  out = out.replace(/<!--[\s\S]*?-->/g, '')
  // Walk tags: keep allowed ones, drop unknown; whitelist attributes.
  out = out.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_m, closing, tag, attrs) => {
    const name = String(tag).toLowerCase()
    if (!ALLOWED_TAGS.has(name)) return ''
    if (closing) return `</${name}>`
    const kept: string[] = []
    const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g
    let m: RegExpExecArray | null
    while ((m = attrRegex.exec(String(attrs))) !== null) {
      const attrName = m[1].toLowerCase()
      const attrVal = (m[3] ?? m[4] ?? m[5] ?? '').trim()
      if (attrName.startsWith('on')) continue
      const allowedForTag = ALLOWED_ATTRS[name]
      const allowedGlobal = ALLOWED_ATTRS['*']
      const allowed = (allowedForTag && allowedForTag.has(attrName)) || allowedGlobal.has(attrName)
      if (!allowed) continue
      if (attrName === 'href') {
        if (!SAFE_URL.test(attrVal)) continue
      }
      if (attrName === 'style') {
        // strip url(), expression(), and javascript:
        const cleaned = attrVal
          .replace(/expression\s*\([^)]*\)/gi, '')
          .replace(/url\s*\([^)]*\)/gi, '')
          .replace(/javascript:/gi, '')
        kept.push(`style="${cleaned.replace(/"/g, '&quot;')}"`)
        continue
      }
      kept.push(`${attrName}="${attrVal.replace(/"/g, '&quot;')}"`)
    }
    if (name === 'a' && !kept.some((k) => k.startsWith('target='))) {
      kept.push('target="_blank"', 'rel="noopener noreferrer"')
    }
    return `<${name}${kept.length ? ' ' + kept.join(' ') : ''}>`
  })
  return out
}

const Email = ({ subject = 'הודעה', body = '', bodyHtml = '', parentName = '' }: Props) => {
  const safeHtml = sanitizeHtml(bodyHtml || '')
  const hasHtml = safeHtml.trim().length > 0
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

                  {hasHtml ? (
                    <div
                      dir="rtl"
                      style={richBody}
                      dangerouslySetInnerHTML={{ __html: safeHtml }}
                    />
                  ) : (
                    <Section style={{ margin: '8px 0 16px' }} dir="rtl">
                      {lines.map((line, i) => (
                        <Text key={i} style={lineStyle} dir="rtl">
                          {line.length === 0 ? '\u00A0' : line}
                        </Text>
                      ))}
                    </Section>
                  )}

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
    bodyHtml: '<p>שלום רב,</p><p>אנחנו בעיצומו של תהליך <strong>שיבוץ התלמידים</strong> למורים.</p><ul><li>עדכון ראשון</li><li>עדכון שני</li></ul><p>במהלך חודש אוגוסט <em>ניצור עמכם קשר</em>.</p>',
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
