import { useState } from 'react'
import { X, UserCog, Loader2, Ban, CheckCircle2 } from 'lucide-react'
import { useAtualizarUsuario } from '@/hooks/queries/useUsuarios'
import type { UserProfile, UserRole } from '@/types/database'

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'admin',       label: 'Administrador' },
  { value: 'gestor',      label: 'Gestor' },
  { value: 'operacional', label: 'Operacional' },
  { value: 'empresa',     label: 'Empresa-cliente' },
]

interface Props {
  usuario: UserProfile
  /** true quando o usuário editado é quem está logado — evita se autoexcluir do acesso */
  isSelf: boolean
  /** admin pode mudar pra qualquer papel; gestor/empresa não sobem ninguém a admin */
  canAssignAdmin: boolean
  onClose: () => void
}

export function EditarUsuarioModal({ usuario, isSelf, canAssignAdmin, onClose }: Props) {
  const atualizar = useAtualizarUsuario()
  const [role, setRole] = useState<UserRole>(usuario.role)

  const roles = canAssignAdmin ? ROLES : ROLES.filter(r => r.value !== 'admin')

  async function handleSalvarPapel() {
    if (role === usuario.role) return
    await atualizar.mutateAsync({ id: usuario.id, input: { role } })
  }

  async function handleToggleAtivo() {
    await atualizar.mutateAsync({ id: usuario.id, input: { active: !usuario.active } })
  }

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--navy-900, #0F172A)', color: '#fff', display: 'grid', placeItems: 'center' }}>
              <UserCog size={16} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{usuario.full_name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>{usuario.email}</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="mp-field">
            <label>Papel de acesso</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select className="mp-input" value={role} onChange={e => setRole(e.target.value as UserRole)} disabled={isSelf}>
                {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <button
                type="button"
                className="tbtn primary"
                disabled={isSelf || role === usuario.role || atualizar.isPending}
                onClick={() => void handleSalvarPapel()}
              >
                {atualizar.isPending ? <Loader2 size={13} className="btn-spinner" /> : 'Salvar'}
              </button>
            </div>
            {isSelf && <div className="mp-hint">Você não pode alterar o próprio papel de acesso.</div>}
          </div>

          <div className="mp-field">
            <label>Acesso à plataforma</label>
            <button
              type="button"
              className={`tbtn ${usuario.active ? 'ghost' : 'primary'}`}
              disabled={isSelf || atualizar.isPending}
              onClick={() => void handleToggleAtivo()}
              style={usuario.active ? { color: 'var(--red-500)' } : undefined}
            >
              {usuario.active
                ? <><Ban size={13} /> Desativar acesso</>
                : <><CheckCircle2 size={13} /> Reativar acesso</>}
            </button>
            {isSelf && <div className="mp-hint">Você não pode desativar o próprio acesso.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
