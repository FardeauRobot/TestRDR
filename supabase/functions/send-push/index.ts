// Supabase Edge Function: send-push
//
// Generic Web Push fan-out for the crew. Two call shapes:
//   • Broadcast (SOS):  { crewId, excludeProfileId, title, body, ... }
//       → every crew member's devices except the sender's.
//   • Direct ("You good?" ping):  { crewId, toProfileId, title, body, ... }
//       → just that one member's devices.
//
// Deploy:   supabase functions deploy send-push --no-verify-jwt
// Secrets:  supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:you@example.com
//
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
import webpush from 'https://esm.sh/web-push@3.6.7'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:crew@example.com'
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

interface SubRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const {
      crewId,
      toProfileId,
      excludeProfileId,
      title = 'Crew Watch',
      body = 'Someone in your crew needs attention.',
      tag = 'crew',
      url = '/'
    } = await req.json()
    if (!crewId) return json({ error: 'crewId required' }, 400)

    let query = admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('crew_id', crewId)
    if (toProfileId) query = query.eq('profile_id', toProfileId)
    else if (excludeProfileId) query = query.neq('profile_id', excludeProfileId)
    const { data, error } = await query
    if (error) throw error

    const subs = (data ?? []) as SubRow[]
    const payload = JSON.stringify({ title, body, tag, url })

    let sent = 0
    const expired: string[] = []
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          )
          sent++
        } catch (e) {
          // 404/410 → the subscription is dead; prune it.
          const status = (e as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) expired.push(s.id)
        }
      })
    )

    if (expired.length) {
      await admin.from('push_subscriptions').delete().in('id', expired)
    }

    return json({ sent, pruned: expired.length, total: subs.length })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
}
