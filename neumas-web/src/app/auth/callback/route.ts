import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { createRouteHandlerClient } from '@/utils/supabase/route-handler'

const BACKEND_URL =
  process.env.BACKEND_URL?.trim().replace(/\/+$/, '') ||
  'https://neumas-production.up.railway.app'

async function isUserProvisioned(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      // Short timeout — if backend is slow we still want to redirect somewhere useful
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'

  const origin = (() => {
    const forwardedHost = request.headers.get('x-forwarded-host')
    const isLocal = process.env.NODE_ENV === 'development'
    if (isLocal) return requestUrl.origin
    if (forwardedHost) return `https://${forwardedHost}`
    return requestUrl.origin
  })()

  if (code) {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && sessionData?.session?.access_token) {
      const accessToken = sessionData.session.access_token

      const provisioned = await isUserProvisioned(accessToken)

      if (provisioned) {
        return NextResponse.redirect(`${origin}${next}`)
      }

      // New OAuth user — send to onboarding so they can set up org/property
      return NextResponse.redirect(
        `${origin}/onboard?supabase_jwt=${encodeURIComponent(accessToken)}`
      )
    }
  }

  // Error fallback — send to the canonical login page, not /login
  return NextResponse.redirect(`${origin}/auth?error=oauth_complete_failed`)
}
