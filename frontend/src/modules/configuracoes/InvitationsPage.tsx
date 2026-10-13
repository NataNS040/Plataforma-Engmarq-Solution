import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/modules/auth/AuthProvider'
import { createInvitation, listInvitations, cancelInvitation, invitationsEnabled } from '@/services/api/convites'

const stateLabel = { pending: 'Aguardando aceite', expired: 'Expirado', cancelled: 'Cancelado', accepted: 'Aceito', failed: 'Envio não confirmado' }
export default function InvitationsPage() {
  const { profile } = useAuth()
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'gestor' | 'operacional'>('operacional')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isAdmin = profile?.role === 'admin'
  const validCompany = !isAdmin || /^[a-f0-9-]{36}$/i.test(company)
  const query = useQuery({ queryKey: ['convites', profile?.id, company], queryFn: () => listInvitations(isAdmin ? company : undefined), enabled: invitationsEnabled && validCompany })
  async function action(run: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await run(); await query.refetch() }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir a operação.') }
    finally { setBusy(false) }
  }
  if (!invitationsEnabled) return <p>Os convites estão temporariamente indisponíveis.</p>
  return <section className="card mp-card"><h1>Convites de acesso</h1>
    <p>Convites dão acesso à empresa. Eles não cadastram colaboradores.</p>
    {isAdmin && <div className="field"><label htmlFor="invite-company">Identificador da empresa</label><input id="invite-company" value={company} onChange={e => setCompany(e.target.value)} /></div>}
    <form onSubmit={e => { e.preventDefault(); void action(() => createInvitation({ email, full_name: name, role, ...(isAdmin ? { empresa_id: company } : {}) })) }}>
      <div className="field"><label htmlFor="invite-name">Nome</label><input id="invite-name" required minLength={2} maxLength={150} value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="field"><label htmlFor="invite-email">E-mail</label><input id="invite-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
      <div className="field"><label htmlFor="invite-role">Permissão</label><select id="invite-role" value={role} onChange={e => setRole(e.target.value as typeof role)}><option value="operacional">Operacional</option><option value="gestor">Gestor</option></select></div>
      <button className="tbtn" disabled={busy || !validCompany}>Enviar convite</button>
    </form>
    {error && <p role="alert">{error}</p>}{query.isError && <p role="alert">Não foi possível carregar os convites.</p>}
    <ul>{query.data?.map(i => <li key={i.id}>{i.full_name} — {i.email} — {stateLabel[i.state]} — {new Date(i.expires_at).toLocaleString('pt-BR')}
      {['pending', 'expired', 'failed'].includes(i.state) && <button className="tbtn" disabled={busy} onClick={() => void action(() => cancelInvitation(i.id))}>Cancelar</button>}
    </li>)}</ul>
  </section>
}
