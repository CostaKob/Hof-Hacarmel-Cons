import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const ADMIN_INBOX = 'musichof@gmail.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const cronSecret = Deno.env.get('RECONCILE_CRON_SECRET')
    const isCron = cronSecret && req.headers.get('x-cron-secret') === cronSecret
    const authHeader = req.headers.get('Authorization') || ''
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const isService = authHeader === `Bearer ${serviceRole}`
    if (!isCron && !isService) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRole)

    const nowIsrael = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
    const todayMD = `${nowIsrael.getMonth() + 1}-${nowIsrael.getDate()}`
    const todayStr = nowIsrael.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })

    const { data: teachers, error } = await supabase
      .from('teachers')
      .select('id, first_name, last_name, birth_date, is_active')
      .not('birth_date', 'is', null)
    if (error) throw error

    const active = (teachers || []).filter((t: any) => t.is_active !== false)

    const mdOf = (d: string) => {
      const dt = new Date(d)
      return `${dt.getUTCMonth() + 1}-${dt.getUTCDate()}`
    }

    const todayBirthdays = active.filter((t: any) => mdOf(t.birth_date) === todayMD)

    // Nothing today → no notification, no email
    if (todayBirthdays.length === 0) {
      return new Response(JSON.stringify({ ok: true, today: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Active academic year for the notification link context
    const { data: years } = await supabase.from('academic_years').select('id').eq('is_active', true).limit(1)
    const yearId = years?.[0]?.id ?? null

    // Avoid duplicates if the job runs more than once a day
    const startOfDay = new Date(nowIsrael.getFullYear(), nowIsrael.getMonth(), nowIsrael.getDate()).toISOString()
    const { data: existing } = await supabase
      .from('notifications')
      .select('entity_id')
      .eq('type', 'teacher_birthday')
      .gte('created_at', startOfDay)
    const alreadyNotified = new Set((existing || []).map((n: any) => n.entity_id))

    for (const t of todayBirthdays) {
      if (alreadyNotified.has(t.id)) continue
      const name = `${t.first_name} ${t.last_name}`
      await supabase.rpc('create_notification', {
        _type: 'teacher_birthday',
        _title: `🎂 יום הולדת היום: ${name}`,
        _body: `ל־${name} יום הולדת היום (${todayStr}). אפשר לשלוח ברכה ישירות מכאן.`,
        _link_path: '/admin/teachers',
        _entity_id: t.id,
        _year_id: yearId,
      })
    }

    const lines: string[] = ['[[HL]]ימי הולדת היום:']
    for (const t of todayBirthdays) lines.push(`🎂 ${t.first_name} ${t.last_name}`)
    lines.push('')
    lines.push(`[רשימת המורים](https://musichof.com/admin/teachers)`)

    const idem = `teacher-birthdays-${todayMD}-${nowIsrael.getFullYear()}`
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRole}`,
        apikey: serviceRole,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        templateName: 'plain-text',
        recipientEmail: ADMIN_INBOX,
        idempotencyKey: idem,
        messageId: idem,
        templateData: {
          subject: `🎂 יום הולדת היום: ${todayBirthdays.map((t: any) => `${t.first_name} ${t.last_name}`).join(', ')}`,
          body: lines.join('\n'),
        },
      }),
    })
    if (!res.ok) console.error('[birthday] email failed', res.status, await res.text().catch(() => ''))

    return new Response(JSON.stringify({
      ok: true,
      today: todayBirthdays.map((t: any) => `${t.first_name} ${t.last_name}`),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('[birthday] error', e)
    return new Response(JSON.stringify({ error: e?.message || 'error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
