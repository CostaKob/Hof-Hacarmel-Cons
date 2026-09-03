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

    // Upcoming within the next 7 days (excluding today)
    const upcoming: any[] = []
    for (let i = 1; i <= 7; i++) {
      const d = new Date(nowIsrael)
      d.setDate(d.getDate() + i)
      const md = `${d.getMonth() + 1}-${d.getDate()}`
      for (const t of active) {
        if (mdOf(t.birth_date) === md) upcoming.push({ ...t, date: d })
      }
    }

    // Active academic year for the notification link context
    const { data: years } = await supabase.from('academic_years').select('id').eq('is_active', true).limit(1)
    const yearId = years?.[0]?.id ?? null

    // In-app notification for each of today's birthdays
    for (const t of todayBirthdays) {
      const name = `${t.first_name} ${t.last_name}`
      await supabase.rpc('create_notification', {
        _type: 'teacher_birthday',
        _title: `🎂 יום הולדת היום: ${name}`,
        _body: `ל־${name} יום הולדת היום (${todayStr}).`,
        _link_path: `/admin/teachers/${t.id}`,
        _entity_id: t.id,
        _year_id: yearId,
      })
    }

    // In-app weekly heads-up: one notification listing upcoming birthdays
    // (so admins also see it inside the app, not only by email)
    if (upcoming.length > 0) {
      const fmt = (d: Date) => d.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: '2-digit' })
      const body = upcoming.map((t: any) => `• ${t.first_name} ${t.last_name} — ${fmt(t.date)}`).join('\n')
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('type', 'teacher_birthday_upcoming')
        .gte('created_at', new Date(nowIsrael.getFullYear(), nowIsrael.getMonth(), nowIsrael.getDate()).toISOString())
        .limit(1)
      if (!existing || existing.length === 0) {
        await supabase.rpc('create_notification', {
          _type: 'teacher_birthday_upcoming',
          _title: `🎂 ימי הולדת של מורים בשבוע הקרוב (${upcoming.length})`,
          _body: body,
          _link_path: '/admin/teachers',
          _entity_id: null,
          _year_id: yearId,
        })
      }
    }

    // Email to admin (only when there is something to report)
    if (todayBirthdays.length > 0 || upcoming.length > 0) {
      const fmt = (d: Date) => d.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: '2-digit' })
      const lines: string[] = []
      if (todayBirthdays.length > 0) {
        lines.push('[[HL]]ימי הולדת היום:')
        for (const t of todayBirthdays) lines.push(`🎂 ${t.first_name} ${t.last_name}`)
        lines.push('')
      }
      if (upcoming.length > 0) {
        lines.push('ימי הולדת בשבוע הקרוב:')
        for (const t of upcoming) lines.push(`• ${t.first_name} ${t.last_name} — ${fmt(t.date)}`)
      }
      lines.push('')
      lines.push(`[כרטיסי מורים](https://musichof.com/admin/teachers)`)

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
            subject: todayBirthdays.length > 0
              ? `🎂 יום הולדת היום: ${todayBirthdays.map((t: any) => `${t.first_name} ${t.last_name}`).join(', ')}`
              : `ימי הולדת של מורים בשבוע הקרוב`,
            body: lines.join('\n'),
          },
        }),
      })
      if (!res.ok) console.error('[birthday] email failed', res.status, await res.text().catch(() => ''))
    }

    return new Response(JSON.stringify({
      ok: true,
      today: todayBirthdays.map((t: any) => `${t.first_name} ${t.last_name}`),
      upcoming: upcoming.map((t: any) => `${t.first_name} ${t.last_name}`),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('[birthday] error', e)
    return new Response(JSON.stringify({ error: e?.message || 'error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
