import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import {
  Building2, Users, Shield, LayoutGrid, Star, MapPin,
  Plus, Download, Pencil, CheckCircle2, MoreHorizontal, Ban,
  HelpCircle, Layers, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'
import { useEmpresa, useAtualizarEmpresa } from '@/hooks/queries/useEmpresas'
import { useUsuariosDaEmpresa } from '@/hooks/queries/useUsuarios'
import { uploadEmpresaLogo, type EmpresaInput } from '@/services/empresasService'
import { getAvatarColor } from '@/lib/theme'
import { CatalogosTab } from './CatalogosTab'
import { CriarUsuarioModal } from './CriarUsuarioModal'
import { EditarUsuarioModal } from './EditarUsuarioModal'
import { APP_NAME } from '@/config/brand'
import { comingSoon } from '@/lib/comingSoon'
import { SoonPanel } from '@/components/ui/SoonPanel'
import type { UserProfile, UserRole } from '@/types/database'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const initials = (n: string) =>
  n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  operacional: 'Operacional',
  empresa: 'Empresa-cliente',
}

// ---------------------------------------------------------------------------
// Reusable bits
// ---------------------------------------------------------------------------
function Tabs({ tabs, tab, setTab }: {
  tabs: { id: string; label: string; icon: React.ElementType }[]
  tab: string
  setTab: (id: string) => void
}) {
  return (
    <div className="mp-tabs">
      {tabs.map(t => (
        <button key={t.id} className={`mp-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
          <t.icon size={14}/><span>{t.label}</span>
        </button>
      ))}
    </div>
  )
}

function CfgField({ label, value, editing, editable = true, type = 'text', full, hint, onChange }: {
  label: string; value: string; editing: boolean; editable?: boolean
  type?: string; full?: boolean; hint?: string; onChange?: (v: string) => void
}) {
  const showInput = editing && editable
  return (
    <div className="mp-field" style={full ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}</label>
      {showInput
        ? <input className="mp-input" type={type} value={value} onChange={e => onChange?.(e.target.value)}/>
        : <div className="mp-input mp-input-static">{value || '—'}</div>}
      {hint && <div className="mp-hint">{hint}</div>}
    </div>
  )
}

function Avatar({ nome, cor, size = 34 }: { nome: string; cor: string; size?: number }) {
  return (
    <span className="ava" style={{ background:cor, width:size, height:size, fontSize:size*0.36, flexShrink:0 }}>
      {initials(nome)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Dados da organização — cartão editável, real (empresas.*)
// ---------------------------------------------------------------------------
function EmpresaDadosCard({ empresaId, editing, setEditing, cardTitle, responsavelLabel, missingFieldsHint }: {
  empresaId: string
  editing: boolean
  setEditing: (v: boolean) => void
  cardTitle: string
  responsavelLabel: string
  missingFieldsHint: string
}) {
  const { data: empresa } = useEmpresa(empresaId)
  const atualizar = useAtualizarEmpresa()
  const [form, setForm] = useState<EmpresaInput | null>(null)

  // Popula o formulário de edição só quando "editing" liga (dado já
  // carregado por essa altura) — ajuste de estado durante a renderização
  // em vez de efeito, pra não disparar um render em cascata à toa.
  const [wasEditing, setWasEditing] = useState(editing)
  if (editing !== wasEditing) {
    setWasEditing(editing)
    if (editing && empresa) {
      setForm({
        razao_social: empresa.razao_social,
        cnpj: empresa.cnpj,
        setor: empresa.setor ?? '',
        cidade: empresa.cidade ?? '',
        uf: empresa.uf ?? '',
        responsavel: empresa.responsavel ?? '',
        email: empresa.email ?? '',
        telefone: empresa.telefone ?? '',
      })
    }
  }

  const patch = (k: keyof EmpresaInput, v: string) => setForm(f => f ? { ...f, [k]: v } : f)

  async function handleSave() {
    if (!form) return
    await atualizar.mutateAsync({ id: empresaId, input: form })
    setEditing(false)
  }

  const v = (k: keyof EmpresaInput) => (editing ? form?.[k] as string : empresa?.[k] as string) ?? ''

  return (
    <div className="card mp-card">
      <h3>{cardTitle}</h3>
      <div className="mp-form" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <CfgField label="Razão social" full editing={editing} value={v('razao_social')} onChange={x => patch('razao_social', x)}/>
        <CfgField label="CNPJ" editing={editing} value={v('cnpj')} onChange={x => patch('cnpj', x)}/>
        <CfgField label="Setor" editing={editing} value={v('setor')} onChange={x => patch('setor', x)}/>
        <CfgField label="Cidade" editing={editing} value={v('cidade')} onChange={x => patch('cidade', x)}/>
        <CfgField label="UF" editing={editing} value={v('uf')} onChange={x => patch('uf', x)}/>
        <CfgField label={responsavelLabel} editing={editing} value={v('responsavel')} onChange={x => patch('responsavel', x)}/>
        <CfgField label="E-mail" type="email" editing={editing} value={v('email')} onChange={x => patch('email', x)}/>
        <CfgField label="Telefone" full editing={editing} value={v('telefone')} onChange={x => patch('telefone', x)}/>
      </div>
      <div className="mp-hint" style={{ marginTop:12 }}>{missingFieldsHint}</div>
      {editing && (
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
          <button type="button" className="tbtn ghost" onClick={() => setEditing(false)} disabled={atualizar.isPending}>Cancelar</button>
          <button type="button" className="tbtn primary" disabled={!form || atualizar.isPending} onClick={() => void handleSave()}>
            {atualizar.isPending ? <Loader2 size={13} className="btn-spinner"/> : <CheckCircle2 size={13}/>} Salvar alterações
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Identidade — logo real (bucket 'logos')
// ---------------------------------------------------------------------------
function LogoCard({ empresaId, brandLabel }: { empresaId: string; brandLabel: string }) {
  const { data: empresa } = useEmpresa(empresaId)
  const atualizar = useAtualizarEmpresa()
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadEmpresaLogo(empresaId, file)
      await atualizar.mutateAsync({ id: empresaId, input: { logo_url: url } })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const logoUrl = empresa?.logo_url ?? null

  return (
    <div className="card mp-card">
      <h3>Identidade</h3>
      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`Logo de ${brandLabel}`}
            style={{ width:48, height:48, borderRadius:10, objectFit:'contain', background:'var(--bg)', border:'1px solid var(--border)' }}
          />
        ) : (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderRadius:10, background:'var(--navy-900)', color:'#fff', fontFamily:'var(--font-display)', fontWeight:800, fontSize:15 }}>
            <Shield size={18} strokeWidth={2.5}/>
            {brandLabel}
          </div>
        )}
      </div>
      <div style={{ display:'flex', gap:8, marginTop:16 }}>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={e => void handleFile(e)}/>
        <button className="tbtn" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 size={13} className="btn-spinner"/> : <Plus size={13}/>} {logoUrl ? 'Trocar logo' : 'Adicionar logo'}
        </button>
        <button className="tbtn ghost is-soon" title="Em breve" onClick={() => comingSoon('Cor de marca')}>Cor de marca</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TeamTable — equipe real (user_profiles)
// ---------------------------------------------------------------------------
function TeamTable({ usuarios, viewerId, onManage }: {
  usuarios: UserProfile[]
  viewerId: string | undefined
  onManage: (u: UserProfile) => void
}) {
  if (usuarios.length === 0) {
    return <div style={{ padding:'32px 20px', textAlign:'center', color:'var(--ink-500)', fontSize:12.5 }}>Nenhum usuário cadastrado ainda.</div>
  }
  return (
    <div style={{ overflow: 'auto' }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Membro</th>
            <th>Papel de acesso</th>
            <th>Status</th>
            <th style={{ textAlign:'right' }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map(u => (
            <tr key={u.id}>
              <td>
                <div className="cell-person">
                  <Avatar nome={u.full_name} cor={getAvatarColor(u.full_name)}/>
                  <div>
                    <div className="name">
                      {u.full_name}
                      {u.id === viewerId && <span className="doc-ver" style={{ marginLeft:6 }}>você</span>}
                    </div>
                    <div className="role">{u.email}</div>
                  </div>
                </div>
              </td>
              <td><span className="cfg-role-pill">{ROLE_LABEL[u.role]}</span></td>
              <td>
                {u.active
                  ? <span className="chip ok"><CheckCircle2 size={11}/> Ativo</span>
                  : <span className="chip crit"><Ban size={11}/> Inativo</span>}
              </td>
              <td style={{ textAlign:'right' }}>
                <button className="icon-btn sm" title="Gerenciar acesso" onClick={() => onManage(u)}><MoreHorizontal size={15}/></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Configurações — Norveo Admin
// ---------------------------------------------------------------------------
const ADMIN_TABS = [
  { id:'conta',       label:'Conta',               icon:Building2 },
  { id:'equipe',      label:'Equipe',              icon:Users },
  { id:'catalogos',   label:'Catálogos',           icon:Layers },
  { id:'papeis',      label:'Papéis e permissões', icon:Shield },
  { id:'integracoes', label:'Integrações',         icon:LayoutGrid },
  { id:'plano',       label:'Plano e faturamento', icon:Star },
]

function ConfiguracoesAdmin({ tab, editing, setEditing, empresaId, onCriarUsuario, onGerenciarUsuario }: {
  tab: string; editing: boolean; setEditing: (v: boolean) => void; empresaId: string
  onCriarUsuario: () => void; onGerenciarUsuario: (u: UserProfile) => void
}) {
  const { profile } = useAuth()
  const usuariosQuery = useUsuariosDaEmpresa(empresaId)

  if (tab === 'conta') {
    return (
      <div className="row-2" style={{ alignItems:'start' }}>
        <EmpresaDadosCard
          empresaId={empresaId}
          editing={editing}
          setEditing={setEditing}
          cardTitle="Dados da organização"
          responsavelLabel="Responsável técnico"
          missingFieldsHint="Endereço completo e registro profissional (CREA) ainda não têm campo dedicado nesta versão."
        />

        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <LogoCard empresaId={empresaId} brandLabel={APP_NAME}/>

          <div className="card mp-card mp-card-tint">
            <h3>Visão geral</h3>
            <div className="mp-status-grid">
              <div><div className="mp-mini-l">Equipe interna</div><div className="mp-mini-v">{usuariosQuery.data?.length ?? '—'} membros</div></div>
              <div><div className="mp-mini-l">Plano</div><div className="mp-mini-v">Enterprise</div></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (tab === 'equipe') {
    const usuarios = usuariosQuery.data ?? []
    const ativos = usuarios.filter(u => u.active).length
    return (
      <div className="card mp-card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'18px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div>
            <h3 style={{ margin:0 }}>Equipe interna Norveo</h3>
            <p className="mp-card-sub" style={{ margin:'4px 0 0' }}>{ativos} membro(s) ativo(s) de {usuarios.length}</p>
          </div>
          <div className="toolbar">
            <button className="tbtn is-soon" title="Em breve" onClick={() => comingSoon('Exportar equipe')}><Download size={13}/> Exportar</button>
            <button className="tbtn primary" onClick={onCriarUsuario}><Plus size={13}/> Criar acesso</button>
          </div>
        </div>
        <TeamTable usuarios={usuarios} viewerId={profile?.id} onManage={onGerenciarUsuario}/>
      </div>
    )
  }

  if (tab === 'papeis') {
    return (
      <div className="card mp-card">
        <SoonPanel
          icon={Shield}
          title="Papéis e permissões — em breve"
          subtitle="Gestão de papéis de acesso e matriz de permissões por função ainda não está disponível nesta versão."
        />
      </div>
    )
  }

  if (tab === 'integracoes') {
    return (
      <div className="card mp-card">
        <SoonPanel
          icon={LayoutGrid}
          title="Integrações — em breve"
          subtitle="eSocial, certificado digital, ERP/folha e API ainda não têm integração real conectada."
        />
      </div>
    )
  }

  // plano
  return (
    <div className="card mp-card">
      <SoonPanel
        icon={Star}
        title="Plano e faturamento — em breve"
        subtitle="Gestão de plano, forma de pagamento e histórico de faturas ainda não está disponível."
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Minha Empresa (empresa cliente)
// ---------------------------------------------------------------------------
const EMP_TABS = [
  { id:'dados',       label:'Dados da empresa',      icon:Building2 },
  { id:'unidades',    label:'Unidades',              icon:MapPin },
  { id:'catalogos',   label:'Catálogos',             icon:Layers },
  { id:'equipe',      label:'Equipe e acessos',      icon:Users },
  { id:'contrato',    label:'Contrato Norveo',      icon:Shield },
  { id:'integracoes', label:'eSocial e integrações', icon:LayoutGrid },
]

function MinhaEmpresa({ tab, editing, setEditing, empresaId, onCriarUsuario, onGerenciarUsuario }: {
  tab: string; editing: boolean; setEditing: (v: boolean) => void; empresaId: string
  onCriarUsuario: () => void; onGerenciarUsuario: (u: UserProfile) => void
}) {
  const { profile } = useAuth()
  const usuariosQuery = useUsuariosDaEmpresa(empresaId)
  const { data: empresa } = useEmpresa(empresaId)

  if (tab === 'dados') {
    return (
      <div className="row-2" style={{ alignItems:'start' }}>
        <EmpresaDadosCard
          empresaId={empresaId}
          editing={editing}
          setEditing={setEditing}
          cardTitle="Dados cadastrais"
          responsavelLabel="Responsável legal"
          missingFieldsHint="CNAE, grau de risco (NR-4), inscrição estadual e endereço completo ainda não têm campo dedicado nesta versão."
        />

        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <LogoCard empresaId={empresaId} brandLabel={empresa?.razao_social ?? 'Sua empresa'}/>

          <div className="card mp-card">
            <h3>Responsáveis Norveo</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                { nome:'Dr. Aurélio Lima',     funcao:'Médico do Trabalho', cor:'#10B981' },
                { nome:'Eng. Marcelo Tannous', funcao:'Eng. de Segurança',  cor:'#3B82F6' },
                { nome:'Rui Campos',           funcao:'Téc. Segurança',     cor:'#DB2777' },
              ].map((r, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:11 }}>
                  <Avatar nome={r.nome} cor={r.cor} size={32}/>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:12.5, fontWeight:600 }}>{r.nome}</div>
                    <div style={{ fontSize:11, color:'var(--ink-500)' }}>{r.funcao}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (tab === 'unidades') {
    return (
      <div className="card mp-card">
        <SoonPanel
          icon={MapPin}
          title="Unidades — em breve"
          subtitle="Cadastro de múltiplos estabelecimentos (CNPJ e grau de risco por unidade) ainda não está disponível."
        />
      </div>
    )
  }

  if (tab === 'equipe') {
    const usuarios = usuariosQuery.data ?? []
    return (
      <div className="card mp-card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'18px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div>
            <h3 style={{ margin:0 }}>Equipe com acesso à plataforma</h3>
            <p className="mp-card-sub" style={{ margin:'4px 0 0' }}>RH, DP e SESMT · defina o papel de cada acesso</p>
          </div>
          <button className="tbtn primary" onClick={onCriarUsuario}><Plus size={13}/> Convidar usuário</button>
        </div>
        <TeamTable usuarios={usuarios} viewerId={profile?.id} onManage={onGerenciarUsuario}/>
      </div>
    )
  }

  if (tab === 'contrato') {
    return (
      <div className="card mp-card">
        <SoonPanel
          icon={Shield}
          title="Contrato Norveo — em breve"
          subtitle="Detalhes do contrato, download e contato com a equipe alocada ainda não estão disponíveis."
        />
      </div>
    )
  }

  // integracoes
  return (
    <div className="card mp-card">
      <SoonPanel
        icon={LayoutGrid}
        title="eSocial e integrações — em breve"
        subtitle="Sincronização real com eSocial, certificado digital e folha/ERP ainda não está conectada."
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export default function ConfiguracoesPage() {
  const { profile } = useAuth()
  const { empresaId, isAdmin: isAdminRole } = useCurrentProfile()
  const isAdmin = profile?.role === 'admin'
  const tabs = isAdmin ? ADMIN_TABS : EMP_TABS
  const [tab, setTab] = useState(tabs[0].id)
  const [editing, setEditing] = useState(false)
  const [showCriarModal, setShowCriarModal] = useState(false)
  const [gerenciando, setGerenciando] = useState<UserProfile | null>(null)

  useEffect(() => {
    setTab(tabs[0].id)
    setEditing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role])

  const dataTab = isAdmin ? 'conta' : 'dados'
  const onDataTab = tab === dataTab
  const onCatalogosTab = tab === 'catalogos'

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>{isAdmin ? 'Configurações' : 'Minha empresa'}</h1>
          <p className="sub">
            {isAdmin
              ? 'Norveo · conta da organização, equipe interna e integrações'
              : 'Cadastro, unidades, acessos e contrato Norveo'}
          </p>
        </div>
        <div className="toolbar">
          {onDataTab && !editing && (
            <button className="tbtn primary" onClick={() => setEditing(true)} disabled={!empresaId}>
              <Pencil size={13}/> Editar dados
            </button>
          )}
          {!onDataTab && <button className="tbtn is-soon" title="Em breve" onClick={() => comingSoon('Central de ajuda')}><HelpCircle size={13}/> Ajuda</button>}
        </div>
      </div>

      <Tabs tabs={tabs} tab={tab} setTab={setTab}/>

      {onCatalogosTab ? (
        <CatalogosTab empresaId={empresaId}/>
      ) : !empresaId ? (
        <div className="card mp-card" style={{ textAlign:'center', color:'var(--ink-500)', padding:'32px 20px' }}>Carregando dados da conta…</div>
      ) : isAdmin ? (
        <ConfiguracoesAdmin
          tab={tab} editing={editing} setEditing={setEditing} empresaId={empresaId}
          onCriarUsuario={() => setShowCriarModal(true)} onGerenciarUsuario={setGerenciando}
        />
      ) : (
        <MinhaEmpresa
          tab={tab} editing={editing} setEditing={setEditing} empresaId={empresaId}
          onCriarUsuario={() => setShowCriarModal(true)} onGerenciarUsuario={setGerenciando}
        />
      )}

      {showCriarModal && empresaId && (
        <CriarUsuarioModal
          adminEmpresaId={empresaId}
          onClose={() => setShowCriarModal(false)}
        />
      )}

      {gerenciando && (
        <EditarUsuarioModal
          usuario={gerenciando}
          isSelf={gerenciando.id === profile?.id}
          canAssignAdmin={isAdminRole}
          onClose={() => setGerenciando(null)}
        />
      )}
    </div>
  )
}
