import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { BrandMark } from '@/components/ui/BrandMark'
import { useAuth } from './AuthProvider'
import { changeRecoveredPassword, newPasswordSchema } from './recovery'
import { acceptInvitation, invitationsEnabled } from '@/services/api/convites'

export default function AcceptInvitationPage() {
  const { session, loading, signOut } = useAuth()
  const [params] = useSearchParams()
  const id = z.uuid().safeParse(params.get('convite'))
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ password: string; confirmation: string }>({ resolver: zodResolver(newPasswordSchema) })
  async function submit(values: { password: string; confirmation: string }) {
    setError('')
    if (!id.success) return
    try {
      await changeRecoveredPassword(values)
      await acceptInvitation(id.data)
      await signOut()
      navigate('/login', { replace: true })
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível aceitar o convite.') }
  }
  return <main className="login-page" style={{ justifyContent: 'center' }}><div className="login-form">
    <BrandMark size="sm" /><h1>Aceitar convite</h1>
    <p>Defina sua senha para concluir o acesso à empresa que enviou o convite.</p>
    {!invitationsEnabled ? <p role="alert">Os convites estão temporariamente indisponíveis.</p>
      : loading ? <p role="status">Validando sessão...</p>
      : !id.success || !session ? <p role="alert">Convite inválido ou link expirado. Solicite orientação à empresa que enviou o convite.</p>
      : <form onSubmit={handleSubmit(submit)} noValidate>
        {(['password', 'confirmation'] as const).map(name => <div className="field" key={name}>
          <label htmlFor={name}>{name === 'password' ? 'Senha' : 'Confirmar senha'}</label>
          <input id={name} type="password" autoComplete="new-password" {...register(name)} />
          {errors[name] && <p role="alert">{errors[name]?.message}</p>}
        </div>)}
        {error && <p role="alert">{error}</p>}
        <button className="btn-primary accent" disabled={isSubmitting}>{isSubmitting ? 'Concluindo...' : 'Aceitar convite'}</button>
      </form>}
    <Link to="/login">Ir para login</Link>
  </div></main>
}
