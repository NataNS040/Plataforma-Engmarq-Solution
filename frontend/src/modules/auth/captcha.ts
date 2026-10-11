export type Turnstile = {
  render: (node: HTMLElement, options: Record<string, unknown>) => string
  remove: (id: string) => void
  reset: (id: string) => void
}
export const captchaApi = () => (window as unknown as { turnstile?: Turnstile }).turnstile
let loading: Promise<Turnstile> | undefined

export function loadCaptcha(): Promise<Turnstile> {
  const available = captchaApi()
  if (available) return Promise.resolve(available)
  if (loading) return loading
  loading = new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    const fail = () => { clearTimeout(timeout); script.remove(); reject(new Error('Não foi possível carregar a verificação de segurança. Tente novamente.')) }
    const timeout = setTimeout(fail, 15_000)
    script.onload = () => {
      clearTimeout(timeout)
      const api = captchaApi()
      if (api) resolve(api)
      else fail()
    }
    script.onerror = fail
    document.head.appendChild(script)
  }).catch(error => { loading = undefined; throw error })
  return loading
}
