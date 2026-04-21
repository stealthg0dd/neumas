import { redirect } from 'next/navigation'

// The canonical login page is at /auth.
// Any links or old bookmarks pointing to /login are forwarded there.
export default function LoginRedirect() {
  redirect('/auth')
}
