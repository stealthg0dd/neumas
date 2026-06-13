import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { AUTH_BOOTSTRAP_COOKIE, encodePendingAuthSession } from '@/lib/auth-bootstrap'
import { logger } from '@/lib/logger'
import { createRouteHandlerClient } from '@/utils/supabase/route-handler'

const BACKEND_URL =
  process.env.BACKEND_URL?.trim().replace(/\/+$/, '') ||
  'https://neumas-production.up.railway.app'

async function fetchProvisionedProfile(accessToken: string) {
  const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5000),
  })

  if (!res.ok) return null
  return (await res.json()) as {
    user_id: string
    email: string
    full_name: string | null
    org_id: string
    org_name: string
    property_id: string
    property_name: string
    role: string
  }
}

export async function GET(request: NextRequest) {
  logger.info({ event_name: 'auth_oauth_callback_started', path: '/auth/callback' }, 'OAuth callback started')

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

      const profile = await fetchProvisionedProfile(accessToken)
      const provisioned = Boolean(profile)

      if (provisioned) {
        logger.info(
          {
            event_name: 'auth_oauth_callback_succeeded',
            path: '/auth/callback',
            user_id: profile?.user_id,
            org_id: profile?.org_id,
          },
          'OAuth callback succeeded with provisioned profile'
        )
        const redirect = NextResponse.redirect(`${origin}${next}`)

        const payload = encodePendingAuthSession({
          access_token: accessToken,
          refresh_token: sessionData.session.refresh_token ?? null,
          expires_in: sessionData.session.expires_in ?? 3600,
          profile: profile!,
        })
        redirect.cookies.set(AUTH_BOOTSTRAP_COOKIE, payload, {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 120,
        })

        return redirect
      }

      // New OAuth user — send to onboarding so they can set up org/property
      logger.info(
        {
          event_name: 'auth_oauth_callback_succeeded',
          path: '/auth/callback',
          next: '/onboard',
        },
        'OAuth callback succeeded; routing to onboarding'
      )
      return NextResponse.redirect(
        `${origin}/onboard?supabase_jwt=${encodeURIComponent(accessToken)}`
      )
    }
  }

  // Error fallback — send to the canonical login page, not /login
  logger.warn(
    { event_name: 'auth_oauth_callback_failed', path: '/auth/callback' },
    'OAuth callback failed; redirecting to auth page'
  )
  return NextResponse.redirect(`${origin}/auth?error=oauth_complete_failed`)
}
