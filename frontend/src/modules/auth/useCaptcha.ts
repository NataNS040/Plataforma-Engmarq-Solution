import { useEffect, useRef, useState } from 'react'
import { captchaApi, loadCaptcha } from './captcha'

export function useCaptcha(enabled = true) {
  const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
  const required = enabled && (!!sitekey || import.meta.env.VITE_AUTH_CAPTCHA_REQUIRED === 'true')
  const node = useRef<HTMLDivElement>(null)
  const widget = useRef<string>(undefined)
  const [token, setToken] = useState<string>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!required) return
    let disposed = false
    const loader = sitekey ? loadCaptcha() : Promise.reject(new Error('A verificação de segurança não está configurada. Contate o suporte.'))
    void loader.then(api => {
      if (!disposed && node.current) widget.current = api.render(node.current, {
        sitekey,
        size: node.current.getBoundingClientRect().width < 300 ? 'compact' : 'flexible',
        language: 'pt-BR',
        callback: (value: string) => { if (!disposed) { setToken(value); setError('') } },
        'expired-callback': () => { if (!disposed) { setToken(undefined); setError('A verificação expirou. Verifique novamente.') } },
        'timeout-callback': () => { if (!disposed) { setToken(undefined); setError('A verificação demorou demais. Tente novamente.') } },
        'error-callback': () => { if (!disposed) { setToken(undefined); setError('Falha na verificação de segurança. Tente novamente.') } },
      })
    }).catch(e => { if (!disposed) { setToken(undefined); setError(e instanceof Error ? e.message : 'Falha na verificação de segurança.') } })
    return () => { disposed = true; if (widget.current) { try { captchaApi()?.remove(widget.current) } catch { /* Already removed by SDK. */ } }; widget.current = undefined }
  }, [required, sitekey, attempt])
  function reset() {
    setToken(undefined)
    setError('')
    if (widget.current) {
      try { captchaApi()?.reset(widget.current) }
      catch { setError('Não foi possível renovar a verificação. Tente novamente.') }
    }
  }
  function retry() { setToken(undefined); setError(''); setAttempt(n => n + 1) }
  return { node, token, error, required, reset, retry }
}
