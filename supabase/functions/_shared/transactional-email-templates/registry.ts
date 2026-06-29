import * as React from 'npm:react@18.3.1'

import { template as registrationConfirmation } from './registration-confirmation.tsx'
import { template as paymentLink } from './payment-link.tsx'
import { template as plainText } from './plain-text.tsx'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: any) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'registration-confirmation': registrationConfirmation,
  'payment-link': paymentLink,
  'plain-text': plainText,
}
