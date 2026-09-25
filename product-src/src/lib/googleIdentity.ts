interface GoogleIdentity {
  initialize(options: { client_id: string; auto_select: boolean; callback: (response: { credential: string }) => void }): void
  renderButton(element: HTMLElement, options: { theme: 'filled_black'; size: 'large'; text: 'continue_with'; shape: 'rectangular' }): void
  disableAutoSelect(): void
}

declare global {
  interface Window {
    __GOOGLE_CLIENT_ID?: string
    google?: { accounts: { id: GoogleIdentity } }
  }
}

let loading: Promise<GoogleIdentity> | undefined

export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id)
  if (loading) return loading
  loading = new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      const identity = window.google?.accounts.id
      if (identity) resolve(identity)
      else reject(new Error('Google sign-in is unavailable'))
    }
    script.onerror = () => reject(new Error('Google sign-in is unavailable'))
    document.head.appendChild(script)
  })
  return loading
}
