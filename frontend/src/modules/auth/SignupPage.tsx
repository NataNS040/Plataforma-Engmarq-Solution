import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { BrandMark } from '@/components/ui/BrandMark'
import { signupCompany, signupSchema, type SignupValues } from './signup'
import { useCaptcha } from './useCaptcha'

export default function SignupPage() {
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const [completed, setCompleted] = useState(false)
  const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
  const enabled = import.meta.env.VITE_PUBLIC_SIGNUP_ENABLED === 'true' && !!sitekey
  const { node: captchaNode, token: captchaToken, error: captchaError, reset: resetCaptcha, retry: retryCaptcha } = useCaptcha(enabled)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) })

  async function submit(values: SignupValues) {
    if (!enabled || !captchaToken) return
    setMessage('')
    try {
      const result = await signupCompany(values, captchaToken)
      if (result.session) navigate('/', { replace: true })
      else setCompleted(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível concluir o cadastro.')
    } finally {
      resetCaptcha()
    }
  }

  const fields = [
    ['razao_social', 'Razão social', 'text', 'organization'],
    ['cnpj', 'CNPJ', 'text', 'off'],
    ['full_name', 'Nome do administrador', 'text', 'name'],
    ['email', 'E-mail do administrador', 'email', 'email'],
    ['password', 'Senha', 'password', 'new-password'],
    ['confirmation', 'Confirmar senha', 'password', 'new-password'],
  ] as const

  return <><div className="aurora"><div className="blob" /></div>
    <main className="login-page" style={{ justifyContent: 'center' }}>
      <div className="login-right" style={{ width: '100%', overflowY: 'auto' }}><div className="login-form">
        <BrandMark size="sm" />
        <h1 style={{ marginTop: 24 }}>Criar conta gratuitamente</h1>
        <p className="sub">Plano gratuito — até 100 colaboradores ativos. Sem cartão de crédito.</p>
        {completed ? <div role="status"><p>Solicitação recebida. Se o cadastro foi aceito, enviamos um e-mail de confirmação. Confirme seu e-mail e faça login para acessar sua empresa. Se você já tem conta, entre com suas credenciais.</p><Link to="/login">Ir para o login</Link><p><Link to="/recuperar-acesso">Não recebi o e-mail / recuperar cadastro</Link></p></div> : <>
          {!enabled && <p role="status">O cadastro público estará disponível em breve.</p>}
          <form onSubmit={handleSubmit(submit)} noValidate>
            {fields.map(([name, label, type, autoComplete]) => <div className="field" key={name}>
              <label htmlFor={`signup-${name}`}>{label}</label>
              <div className="ip"><input id={`signup-${name}`} type={type} autoComplete={autoComplete}
                aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `error-${name}` : undefined}
                {...register(name)} /></div>
              {errors[name] && <span id={`error-${name}`} role="alert" className="field-error">{errors[name]?.message}</span>}
            </div>)}
            <p>Você será o administrador desta nova empresa. O CNPJ não pode pertencer a uma empresa já cadastrada.</p>
            <div ref={captchaNode} />
            {captchaError && <p role="alert">{captchaError} <button type="button" onClick={retryCaptcha}>Tentar verificação novamente</button></p>}
            {message && <p role="alert">{message}</p>}
            <button className="btn-primary accent" type="submit" disabled={!enabled || !captchaToken || isSubmitting}>
              {isSubmitting ? 'Criando conta...' : 'Criar conta gratuitamente'}
            </button>
          </form>
          <p style={{ marginTop: 24 }}><Link to="/login">Já tenho conta — acessar</Link></p>
          <p><Link to="/recuperar-acesso">CNPJ reservado ou confirmação pendente? Recuperar acesso</Link></p>
        </>}
      </div></div>
    </main></>
}
