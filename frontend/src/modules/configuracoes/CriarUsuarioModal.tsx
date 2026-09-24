import { useState } from 'react'
import { X, UserPlus, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useEmpresas } from '@/hooks/queries/useEmpresas'
import type { UserRole } from '@/types/database'

const ROLES: { value: UserRole; label: string; desc: string }[] = [
  { value: 'admin',       label: 'Administrador',  desc: 'Acesso total à plataforma EngMarq' },
  { value: 'gestor',      label: 'Gestor',         desc: 'Operação e compliance' },
  { value: 'operacional', label: 'Operacional',    desc: 'Documentos, treinamentos e exames' },
  { value: 'empresa',     label: 'Empresa-cliente',desc: 'Acesso à empresa vinculada' },
]

interface Props {
  /** empresa_id do admin logado (usado para roles internas) */
  adminEmpresaId: string
  onClose: () => void
  onSuccess?: () => void
}

export function CriarUsuarioModal({ adminEmpresaId, onClose, onSuccess }: Props) {
  const { data: empresas = [] } = useEmpresas()

  const [fullName, setFullName]     = useState('')
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [role, setRole]             = useState<UserRole>('gestor')
  const [empresaId, setEmpresaId]   = useState('')
  const [showPwd, setShowPwd]       = useState(false)
  const [loading, setLoading]       = useState(false)

  const isEmpresaRole = role === 'empresa'
  const resolvedEmpresaId = isEmpresaRole ? empresaId : adminEmpresaId

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (password !== confirmPwd) {
      toast.error('As senhas não coincidem.')
      return
    }
    if (password.length < 8) {
      toast.error('A senha deve ter ao menos 8 caracteres.')
      return
    }
    if (isEmpresaRole && !empresaId) {
      toast.error('Selecione a empresa-cliente.')
      return
    }

    setLoading(true)
    try {
      const session = (await supabase.auth.getSession()).data.session
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email:      email.trim().toLowerCase(),
          password,
          full_name:  fullName.trim(),
          role,
          empresa_id: resolvedEmpresaId,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })

      if (error || data?.error) {
        toast.error(data?.error ?? error?.message ?? 'Erro ao criar usuário.')
        return
      }

      toast.success(`Acesso criado para ${email.trim()}.`)
      onSuccess?.()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="modal-overlay"
      style={{
        position:'fixed', inset:0, zIndex:1000,
        background:'rgba(0,0,0,0.45)', backdropFilter:'blur(2px)',
        display:'flex', alignItems:'center', justifyContent:'center',
        padding:16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="card"
        style={{ width:'100%', maxWidth:460, padding:0, overflow:'hidden', display:'flex', flexDirection:'column' }}
      >
        {/* Header */}
        <div style={{ padding:'18px 20px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:34, height:34, borderRadius:9, background:'var(--navy-900, #0F172A)', color:'#fff', display:'grid', placeItems:'center' }}>
              <UserPlus size={16}/>
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:14 }}>Criar acesso</div>
              <div style={{ fontSize:11.5, color:'var(--ink-500)' }}>Novo usuário com e-mail e senha</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} disabled={loading}><X size={16}/></button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}>
          <div className="mp-field">
            <label>Nome completo</label>
            <input
              className="mp-input"
              type="text"
              required
              autoFocus
              placeholder="Ex: Ana Souza"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
            />
          </div>

          <div className="mp-field">
            <label>E-mail</label>
            <input
              className="mp-input"
              type="email"
              required
              placeholder="usuario@exemplo.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="mp-field">
              <label>Senha</label>
              <div style={{ position:'relative' }}>
                <input
                  className="mp-input"
                  type={showPwd ? 'text' : 'password'}
                  required
                  minLength={8}
                  placeholder="Mín. 8 caracteres"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ paddingRight:36 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', color:'var(--ink-400)', background:'none', border:'none', cursor:'pointer', padding:0 }}
                >
                  {showPwd ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
            </div>
            <div className="mp-field">
              <label>Confirmar senha</label>
              <input
                className="mp-input"
                type={showPwd ? 'text' : 'password'}
                required
                minLength={8}
                placeholder="Repita a senha"
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
              />
            </div>
          </div>

          <div className="mp-field">
            <label>Papel de acesso</label>
            <select
              className="mp-input"
              value={role}
              onChange={e => setRole(e.target.value as UserRole)}
            >
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
              ))}
            </select>
          </div>

          {isEmpresaRole && (
            <div className="mp-field">
              <label>Empresa-cliente</label>
              <select
                className="mp-input"
                required
                value={empresaId}
                onChange={e => setEmpresaId(e.target.value)}
              >
                <option value="">Selecione a empresa…</option>
                {empresas.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.razao_social}</option>
                ))}
              </select>
            </div>
          )}

          {/* Footer */}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, paddingTop:4 }}>
            <button type="button" className="tbtn ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="tbtn primary" disabled={loading}>
              {loading
                ? <><Loader2 size={13} style={{ animation:'spin 1s linear infinite' }}/> Criando…</>
                : <><UserPlus size={13}/> Criar acesso</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
