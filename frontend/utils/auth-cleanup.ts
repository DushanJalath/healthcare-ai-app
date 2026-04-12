const AUTH_STORAGE_KEYS = ['access_token', 'refresh_token', 'user'] as const

export function clearStoredAuthFromBrowser() {
  if (typeof window === 'undefined') return
  for (const key of AUTH_STORAGE_KEYS) {
    localStorage.removeItem(key)
  }
}

/** Pick a login URL from the current path so API errors log users out to the right portal. */
export function loginPathFromWindow(): string {
  if (typeof window === 'undefined') return '/'
  const p = window.location.pathname
  if (p.startsWith('/patients') || p.startsWith('/patient')) return '/patient/login'
  if (p.startsWith('/clinic')) return '/clinic/login'
  return '/'
}

/** Clears backend token storage, ends the NextAuth session, and hard-navigates to the correct login page. */
export async function forceBrowserLogoutToLogin() {
  clearStoredAuthFromBrowser()
  try {
    const { signOut } = await import('next-auth/react')
    await signOut({ redirect: false })
  } catch {
    // Still navigate even if signOut fails (e.g. script load edge case)
  }
  window.location.assign(loginPathFromWindow())
}
