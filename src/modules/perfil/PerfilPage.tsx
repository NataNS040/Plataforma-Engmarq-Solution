import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Lock, Loader2, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/modules/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  operacional: 'Operacional',
  empresa: 'Acesso empresa',
}

const passwordSchema = z.object({
  password: z.string().min(6, 'A senha deve ter ao menos 6 caracteres'),
  confirm: z.string().min(6, 'Confirme a nova senha'),
}).refine(v => v.password === v.confirm, {
  message: 'As senhas não coincidem',
  path: ['confirm'],
})

type PasswordValues = z.infer<typeof passwordSchema>

export default function PerfilPage() {
  const { profile } = useAuth()
  const [changingPassword, setChangingPassword] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirm: '' },
  })

  async function onSubmit(values: PasswordValues) {
    const { error } = await supabase.auth.updateUser({ password: values.password })
    if (error) {
      const app = handleSupabaseError(error, 'Não foi possível atualizar a senha.')
      toast.error(app.message)
      return
    }
    toast.success('Senha atualizada com sucesso.')
    reset()
    setChangingPassword(false)
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : '?'

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Meu perfil</h1>
          <p className="sub">Seus dados de acesso à plataforma.</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="avb" style={{ background: 'var(--navy-900)' }}>{initials}</div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>
              {profile?.full_name ?? 'Usuário'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{profile?.email}</div>
          </div>
        </div>

        <div className="field-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <div className="f-lbl">Perfil de acesso</div>
            <div className="f-val">{profile?.role ? ROLE_LABEL[profile.role] ?? profile.role : '—'}</div>
          </div>
          <div>
            <div className="f-lbl">E-mail</div>
            <div className="f-val">{profile?.email ?? '—'}</div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 0 }} />

        {!changingPassword ? (
          <button className="tbtn" style={{ alignSelf: 'flex-start' }} onClick={() => setChangingPassword(true)}>
            <Lock size={13} /> Trocar senha
          </button>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label htmlFor="perfil-password">Nova senha</label>
              <div className="ip">
                <span className="ip-icon"><Lock size={15} /></span>
                <input id="perfil-password" type="password" autoComplete="new-password" {...register('password')} />
              </div>
              {errors.password && (
                <span className="field-error" role="alert" style={{ color: 'var(--color-danger)', fontSize: 12, marginTop: 4, display: 'block' }}>
                  {errors.password.message}
                </span>
              )}
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="perfil-confirm">Confirmar nova senha</label>
              <div className="ip">
                <span className="ip-icon"><Lock size={15} /></span>
                <input id="perfil-confirm" type="password" autoComplete="new-password" {...register('confirm')} />
              </div>
              {errors.confirm && (
                <span className="field-error" role="alert" style={{ color: 'var(--color-danger)', fontSize: 12, marginTop: 4, display: 'block' }}>
                  {errors.confirm.message}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="tbtn" onClick={() => { setChangingPassword(false); reset() }}>Cancelar</button>
              <button type="submit" className="tbtn primary" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 size={13} className="btn-spinner" /> : <CheckCircle2 size={13} />}
                Salvar nova senha
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
