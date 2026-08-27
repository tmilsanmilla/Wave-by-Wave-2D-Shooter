import { createClient } from '@supabase/supabase-js'

const INVALID_MESSAGE =
  'Email/username or password is incorrect. If you just signed up, verify your email first.'
const TRY_LATER_MESSAGE = 'Too many sign-in attempts. Wait a moment and try again.'
const UNAVAILABLE_MESSAGE = 'Sign-in is temporarily unavailable. Try again later.'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Retry-After',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  Vary: 'Origin',
}

function json(status: number, body: Record<string, string>, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(corsHeaders)
  new Headers(headers).forEach((value, key) => responseHeaders.set(key, value))
  return new Response(JSON.stringify(body), { status, headers: responseHeaders })
}

function parseKeyDictionary(name: string): string[] {
  const raw = Deno.env.get(name)
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object'
      ? Object.values(value).filter((key): key is string => typeof key === 'string' && key.length > 0)
      : []
  } catch {
    return []
  }
}

function allowedPublishableKeys(): string[] {
  const hosted = parseKeyDictionary('SUPABASE_PUBLISHABLE_KEYS')
  if (hosted.length) return [...new Set(hosted)]
  // Compatibility only for projects that have not created new API keys yet.
  // Once hosted publishable keys exist, the legacy anon key is not accepted.
  const legacy = Deno.env.get('SUPABASE_ANON_KEY') || ''
  return legacy ? [legacy] : []
}

function defaultSecretKey(): string {
  const singular = Deno.env.get('SUPABASE_SECRET_KEY') || ''
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (raw) {
    try {
      const keys = JSON.parse(raw)
      if (keys && typeof keys === 'object') {
        if (typeof keys.default === 'string' && keys.default.startsWith('sb_secret_')) return keys.default
        const first = Object.values(keys).find(
          (key): key is string => typeof key === 'string' && key.startsWith('sb_secret_'),
        )
        if (first) return first
      }
    } catch {
      // The generic unavailable response below keeps configuration details private.
    }
  }
  return singular.startsWith('sb_secret_') ? singular : ''
}

function clientIp(request: Request): string {
  const valid = (value: string) => {
    if (!value || value.length > 64) return ''
    const parts = value.split('.')
    if (parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return value
    if (!value.includes(':') || !/^[0-9a-f:]+$/i.test(value)) return ''
    try {
      const hostname = new URL(`http://[${value}]/`).hostname
      return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
    } catch {
      return ''
    }
  }
  const cloudflare = valid((request.headers.get('cf-connecting-ip') || '').trim())
  if (cloudflare) return cloudflare
  // A caller can prepend X-Forwarded-For. The final valid hop is the gateway's
  // safe fallback; never trust the attacker-controlled first value.
  const forwarded = (request.headers.get('x-forwarded-for') || '').split(',').map(value => value.trim())
  for (let index = forwarded.length - 1; index >= 0; index--) {
    const candidate = valid(forwarded[index] || '')
    if (candidate) return candidate
  }
  return ''
}

function classifyIdentifier(raw: unknown): { kind: 'email' | 'username'; value: string } | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value || value.length > 254 || /\s/.test(value)) return null
  if (!value.startsWith('@') && /^[^@]+@[^@]+$/.test(value)) return { kind: 'email', value }
  const username = value.replace(/^@/, '')
  return /^[A-Za-z0-9_]{3,32}$/.test(username) ? { kind: 'username', value: username } : null
}

const ZERO_USER_ID = '00000000-0000-0000-0000-000000000000'

async function resolvedUsernameTarget(
  admin: ReturnType<typeof createClient>,
  username: string,
): Promise<{ email: string; userId: string }> {
  const key = username.toLowerCase()
  const { data: profile, error: profileError } = await admin
    .from('social_profiles')
    .select('user_id,handle_key')
    .eq('handle_key', key)
    .maybeSingle()
  if (profileError) throw new Error('profile lookup failed')
  let userId = typeof profile?.user_id === 'string' ? profile.user_id : ''
  const generated = `op_${userId.replaceAll('-', '').slice(0, 20)}`
  const generatedShort = `op_${userId.replaceAll('-', '').slice(0, 8)}`
  if (key === 'username_not_set' || key === 'usernamenotset' || key === generated || key === generatedShort) userId = ''
  // Always make the same Auth Admin call for a known and unknown username.
  // The zero UUID can never be an Auth user, but equalizes network work.
  const { data, error } = await admin.auth.admin.getUserById(userId || ZERO_USER_ID)
  if (userId && error) throw new Error('auth lookup failed')
  return {
    email: userId && typeof data?.user?.email === 'string' ? data.user.email.trim() : '',
    userId,
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return json(405, { code: 'METHOD_NOT_ALLOWED', message: UNAVAILABLE_MESSAGE })

  const callerKey = request.headers.get('apikey') || ''
  if (!callerKey || !allowedPublishableKeys().includes(callerKey)) {
    return json(401, { code: 'INVALID_CREDENTIALS', message: INVALID_MESSAGE })
  }

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 4096) return json(401, { code: 'INVALID_CREDENTIALS', message: INVALID_MESSAGE })

  let body: { identifier?: unknown; password?: unknown }
  try {
    const raw = await request.text()
    if (raw.length > 4096) throw new Error('body too large')
    body = JSON.parse(raw)
  } catch {
    return json(401, { code: 'INVALID_CREDENTIALS', message: INVALID_MESSAGE })
  }

  const identifier = classifyIdentifier(body?.identifier)
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!identifier || !password || password.length > 1024) {
    return json(401, { code: 'INVALID_CREDENTIALS', message: INVALID_MESSAGE })
  }

  const url = Deno.env.get('SUPABASE_URL') || ''
  const secretKey = defaultSecretKey()
  if (!url || !secretKey) return json(503, { code: 'SIGN_IN_UNAVAILABLE', message: UNAVAILABLE_MESSAGE })

  try {
    const admin = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    })
    const target = identifier.kind === 'email'
      ? { email: identifier.value, userId: '' }
      : await resolvedUsernameTarget(admin, identifier.value)

    // Unknown usernames still take the normal Auth password path. This keeps
    // the outward response and Auth rate-limit behavior identical while never
    // disclosing whether a username exists or which private email it maps to.
    const authEmail = target.email || 'missing-account@invalid.outpost-zero.local'
    const authHeaders: Record<string, string> = {
      apikey: secretKey,
      'Content-Type': 'application/json',
    }
    const forwardedFor = clientIp(request)
    if (forwardedFor) authHeaders['Sb-Forwarded-For'] = forwardedFor
    const authResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ email: authEmail, password }),
    })

    if (authResponse.status === 429) {
      const retryAfter = authResponse.headers.get('retry-after')
      const headers = retryAfter && /^\d{1,6}$/.test(retryAfter) ? { 'Retry-After': retryAfter } : {}
      return json(429, { code: 'TRY_LATER', message: TRY_LATER_MESSAGE }, headers)
    }
    if (!authResponse.ok) {
      return json(401, { code: 'INVALID_CREDENTIALS', message: INVALID_MESSAGE })
    }

    const session = await authResponse.json()
    const accessToken = typeof session?.access_token === 'string' ? session.access_token : ''
    const refreshToken = typeof session?.refresh_token === 'string' ? session.refresh_token : ''
    const authenticatedUserId = typeof session?.user?.id === 'string' ? session.user.id : ''
    // A username must authenticate the exact Auth user referenced by the
    // canonical Social profile read above. This rejects a stale/swapped
    // resolver result and also makes every unknown username fail closed.
    if (identifier.kind === 'username' && (!target.userId || authenticatedUserId !== target.userId)) {
      return json(401, { code: 'INVALID_CREDENTIALS', message: INVALID_MESSAGE })
    }
    if (!accessToken || !refreshToken) {
      return json(503, { code: 'SIGN_IN_UNAVAILABLE', message: UNAVAILABLE_MESSAGE })
    }
    return json(200, { access_token: accessToken, refresh_token: refreshToken })
  } catch {
    // Never log or return credentials, resolved email, UUID, or raw Auth errors.
    return json(503, { code: 'SIGN_IN_UNAVAILABLE', message: UNAVAILABLE_MESSAGE })
  }
})
