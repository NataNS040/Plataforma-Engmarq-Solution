import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { BrandMark } from '@/components/ui/BrandMark'
import { recoveryEmailSchema, requestAccessRecovery } from './recovery'
import { useCaptcha } from './useCaptcha'

export default function RecoveryPage() {
  const [action, setAction] = useState<'confirmation' | 'password'>('confirmation')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(false)
  const timer = useRef<number>(undefined)
  const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined
  const supportValid = recoveryEmailSchema.safeParse({ email: supportEmail }).success
  useEffect(() => () => { if (timer.current !== undefined) window.clearTimeout(timer.current) }, [])
  const { node, token, error: captchaError, required, reset, retry } = useCaptcha()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{email: string}>({ resolver: zodResolver(recoveryEmailSchema) })
  async function submit(values: { email: string }) {
    if (cooldown || (required && !token)) return
    setError(''); setMessage('')
    try {
      setMessage(await requestAccessRecovery(values.email, action, token))
      setCooldown(true)
      // Browser cooldown is UX only. Auth rate limits/CAPTCHA are authoritative.
      timer.current = window.setTimeout(() => setCooldown(false), 60_000)
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível enviar a solicitação.') }
    finally { reset() }
  }
  return <><div className="aurora"><div className="blob" /></div><main className="login-page" style={{ justifyContent: 'center' }}>
    <div className="login-right" style={{ width: '100%', overflowY: 'auto' }}><div className="login-form">
      <BrandMark size="sm" /><h1 style={{ marginTop: 24 }}>Recuperar acesso</h1>
      <p className="sub">Use o e-mail do cadastro original. Sua empresa e seus dados serão preservados.</p>
      <form onSubmit={event => { void handleSubmit(submit)(event) }} noValidate>
        <div className="field"><label htmlFor="recovery-email">E-mail do cadastro</label><div className="ip">
          <input id="recovery-email" type="email" autoComplete="email" {...register('email')} aria-invalid={!!errors.email} /></div>
          {errors.email && <span role="alert">{errors.email.message}</span>}</div>
        <fieldset disabled={isSubmitting}><legend>Como podemos ajudar?</legend>
          <label><input type="radio" name="recovery-action" checked={action === 'confirmation'} onChange={() => setAction('confirmation')} /> Reenviar confirmação de e-mail</label><br />
          <label><input type="radio" name="recovery-action" checked={action === 'password'} onChange={() => setAction('password')} /> Recuperar minha senha</label>
        </fieldset>
        <div ref={node} />
        {captchaError && <p role="alert">{captchaError} <button type="button" onClick={retry}>Tentar verificação novamente</button></p>}
        {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
        <button type="submit" className="btn-primary accent" disabled={isSubmitting || cooldown || (required && !token)}>
          {cooldown ? 'Aguarde 60 segundos para reenviar' : isSubmitting ? 'Enviando...' : 'Enviar instruções'}
        </button>
      </form>
      <p>Seu CNPJ já está reservado? Recupere o acesso do cadastro original. Se não tem acesso ao e-mail ou não reconhece o cadastro, contate o suporte para revisão com comprovação de titularidade. O CNPJ não é liberado automaticamente, e informar seus dados não transfere a empresa.</p>
      {supportValid && <p><a href={`mailto:${supportEmail}?subject=Revis%C3%A3o%20de%20cadastro%20Norveo`}>Solicitar revisão ao suporte</a></p>}
      <Link to="/login">Voltar ao login</Link>
    </div></div></main></>
}
