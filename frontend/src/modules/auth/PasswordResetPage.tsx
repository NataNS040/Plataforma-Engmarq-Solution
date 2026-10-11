import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { BrandMark } from '@/components/ui/BrandMark'
import { useAuth } from './AuthProvider'
import { changeRecoveredPassword, newPasswordSchema } from './recovery'

export default function PasswordResetPage() {
  const navigate = useNavigate()
  const { session, loading, signOut } = useAuth()
  const [error, setError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ password: string; confirmation: string }>({ resolver: zodResolver(newPasswordSchema) })
  async function submit(values: { password: string; confirmation: string }) {
    setError('')
    try { await changeRecoveredPassword(values); await signOut(); navigate('/login', { replace: true }) }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar a senha.') }
  }
  return <><div className="aurora"><div className="blob" /></div><main className="login-page" style={{ justifyContent: 'center' }}>
    <div className="login-right" style={{ width: '100%' }}><div className="login-form">
      <BrandMark size="sm" /><h1 style={{ marginTop: 24 }}>Definir nova senha</h1>
      <p className="sub">Use pelo menos 12 caracteres. Após salvar, faça login novamente.</p>
      {loading ? <p role="status">Validando sessão...</p> : !session ? <p role="alert">O link expirou ou não há uma sessão válida. <Link to="/recuperar-acesso">Solicitar novo link</Link></p> :
        <form onSubmit={handleSubmit(submit)} noValidate>
          {(['password','confirmation'] as const).map(name => <div className="field" key={name}>
            <label htmlFor={`reset-${name}`}>{name === 'password' ? 'Nova senha' : 'Confirmar senha'}</label><div className="ip">
              <input id={`reset-${name}`} type="password" autoComplete="new-password" {...register(name)} aria-invalid={!!errors[name]} /></div>
            {errors[name] && <span role="alert">{errors[name]?.message}</span>}
          </div>)}
          {error && <p role="alert">{error}</p>}
          <button className="btn-primary accent" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Salvar nova senha'}</button>
        </form>}
      <p><Link to="/recuperar-acesso">Reenviar instruções</Link></p>
    </div></div></main></>
}
