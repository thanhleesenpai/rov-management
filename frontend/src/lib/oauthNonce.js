const STORAGE_KEY = 'oauth_nonce'

// Generates a one-time nonce for the Google OAuth round trip and stores it in
// sessionStorage. The backend echoes it back in the callback redirect; AuthCallback
// compares it against this stored value before trusting the tokens in the URL —
// this stops an attacker from tricking a victim into logging into the attacker's
// own account by sending a crafted /auth/callback?accessToken=...&refreshToken=... link
// (login CSRF), since the attacker can't write to the victim's sessionStorage.
export function startGoogleOAuth(baseUrl) {
  const nonce = crypto.randomUUID()
  sessionStorage.setItem(STORAGE_KEY, nonce)
  window.location.href = `${baseUrl}?nonce=${encodeURIComponent(nonce)}`
}

// Consumes (reads + clears) the stored nonce so it can only be checked once.
export function consumeOAuthNonce() {
  const nonce = sessionStorage.getItem(STORAGE_KEY)
  sessionStorage.removeItem(STORAGE_KEY)
  return nonce
}
