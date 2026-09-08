import { useState, useEffect } from 'react'
import {
  Building2, Users, Shield, LayoutGrid, Star, MapPin,
  Plus, Download, Pencil, CheckCircle2, Clock, MoreHorizontal,
  HelpCircle, Layers,
} from 'lucide-react'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'
import { CatalogosTab } from './CatalogosTab'
import { CriarUsuarioModal } from './CriarUsuarioModal'
import { APP_NAME } from '@/config/brand'
import { comingSoon } from '@/lib/comingSoon'
import { SoonPanel } from '@/components/ui/SoonPanel'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const initials = (n: string) =>
  n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()

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

function CfgField({ label, v, editing, type = 'text', full, hint }: {
  label: string; v: string; editing: boolean
  type?: string; full?: boolean; hint?: string
}) {
  return (
    <div className="mp-field" style={full ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}</label>
      {editing
        ? <input className="mp-input" type={type} defaultValue={v}/>
        : <div className="mp-input mp-input-static">{v}</div>}
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
// TeamTable
// ---------------------------------------------------------------------------
interface Member {
  nome: string; email: string; funcao: string; papel: string
  cor: string; status: string; you?: boolean; emp?: number
}

function TeamTable({ members, showEmp, empHead = 'Empresas' }: {
  members: Member[]; showEmp?: boolean; empHead?: string
}) {
  return (
    <div style={{ overflow: 'auto' }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Membro</th>
            <th>Função</th>
            <th>Papel de acesso</th>
            {showEmp && <th style={{ textAlign:'center' }}>{empHead}</th>}
            <th>Status</th>
            <th style={{ textAlign:'right' }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m, i) => (
            <tr key={i}>
              <td>
                <div className="cell-person">
                  <Avatar nome={m.nome} cor={m.cor}/>
                  <div>
                    <div className="name">
                      {m.nome}
                      {m.you && <span className="doc-ver" style={{ marginLeft:6 }}>você</span>}
                    </div>
                    <div className="role">{m.email}</div>
                  </div>
                </div>
              </td>
              <td style={{ fontSize:12.5 }}>{m.funcao}</td>
              <td><span className="cfg-role-pill">{m.papel}</span></td>
              {showEmp && (
                <td style={{ textAlign:'center', fontFamily:'var(--font-display)', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>
                  {m.emp || '—'}
                </td>
              )}
              <td>
                {m.status === 'ativo'
                  ? <span className="chip ok"><CheckCircle2 size={11}/> Ativo</span>
                  : <span className="chip warn"><Clock size={11}/> Convite pendente</span>}
              </td>
              <td style={{ textAlign:'right' }}>
                <button className="icon-btn sm is-soon" title="Em breve" onClick={() => comingSoon('Ações da equipe')}><MoreHorizontal size={15}/></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dados — Norveo (admin)
// ---------------------------------------------------------------------------
const ENG_TEAM: Member[] = [
  { nome:'Renata Almeida',       email:'renata@norveo.com.br',  funcao:'Coordenadora SST',  papel:'Administrador', emp:24, cor:'#F59E0B', status:'ativo', you:true },
  { nome:'Dr. Aurélio Lima',     email:'aurelio@norveo.com.br', funcao:'Médico do Trabalho', papel:'Médico',        emp:9,  cor:'#10B981', status:'ativo' },
  { nome:'Dra. Helena Vasquez',  email:'helena@norveo.com.br',  funcao:'Médica do Trabalho', papel:'Médico',        emp:7,  cor:'#0891B2', status:'ativo' },
  { nome:'Eng. Marcelo Tannous', email:'marcelo@norveo.com.br', funcao:'Eng. de Segurança',  papel:'Engenheiro',    emp:12, cor:'#3B82F6', status:'ativo' },
  { nome:'Eng. Ana Becker',      email:'ana@norveo.com.br',     funcao:'Eng. de Segurança',  papel:'Engenheiro',    emp:8,  cor:'#8B5CF6', status:'ativo' },
  { nome:'Rui Campos',           email:'rui@norveo.com.br',     funcao:'Téc. Segurança',     papel:'Técnico',       emp:15, cor:'#DB2777', status:'ativo' },
  { nome:'Beatriz Nunes',        email:'beatriz@norveo.com.br', funcao:'Téc. Segurança',     papel:'Técnico',       emp:0,  cor:'#475569', status:'convite' },
]

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

function ConfiguracoesAdmin({ tab, editing, onCriarUsuario }: { tab: string; editing: boolean; onCriarUsuario: () => void }) {
  if (tab === 'conta') {
    return (
      <div className="row-2" style={{ alignItems:'start' }}>
        <div className="card mp-card">
          <h3>Dados da organização</h3>
          <div className="mp-form" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <CfgField label="Razão social" full editing={editing} v="Norveo Tecnologia e Gestão Ltda"/>
            <CfgField label="Nome fantasia" editing={editing} v="Norveo"/>
            <CfgField label="CNPJ" editing={editing} v="18.402.776/0001-55"/>
            <CfgField label="Registro CREA-SP" editing={editing} v="CREA-SP 0.612.487"/>
            <CfgField label="Responsável técnico" editing={editing} v="Eng. Marcelo Tannous"/>
            <CfgField label="E-mail" editing={editing} type="email" v="contato@norveo.com.br"/>
            <CfgField label="Telefone" editing={editing} v="(11) 4063-8800"/>
            <CfgField label="Endereço" full editing={editing} v="Av. Paulista, 1842 · cj. 1205 · São Paulo · SP"/>
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className="card mp-card">
            <h3>Identidade</h3>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderRadius:10, background:'var(--navy-900)', color:'#fff', fontFamily:'var(--font-display)', fontWeight:800, fontSize:15 }}>
                <Shield size={18} strokeWidth={2.5}/>
                {APP_NAME}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button className="tbtn is-soon" title="Em breve" onClick={() => comingSoon('Trocar logo')}><Plus size={13}/> Trocar logo</button>
              <button className="tbtn ghost is-soon" title="Em breve" onClick={() => comingSoon('Cor de marca')}>Cor de marca</button>
            </div>
          </div>

          <div className="card mp-card mp-card-tint">
            <h3>Visão geral</h3>
            <div className="mp-status-grid">
              <div><div className="mp-mini-l">Empresas</div><div className="mp-mini-v">24 ativas</div></div>
              <div><div className="mp-mini-l">Equipe interna</div><div className="mp-mini-v">7 membros</div></div>
              <div><div className="mp-mini-l">Colaboradores</div><div className="mp-mini-v">5.847</div></div>
              <div><div className="mp-mini-l">Plano</div><div className="mp-mini-v">Enterprise</div></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (tab === 'equipe') {
    const ativos = ENG_TEAM.filter(m => m.status === 'ativo').length
    return (
      <div className="card mp-card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'18px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div>
            <h3 style={{ margin:0 }}>Equipe interna Norveo</h3>
            <p className="mp-card-sub" style={{ margin:'4px 0 0' }}>{ativos} membros ativos · 1 convite pendente · profissionais alocados às empresas-cliente</p>
          </div>
          <div className="toolbar">
            <button className="tbtn is-soon" title="Em breve" onClick={() => comingSoon('Exportar equipe')}><Download size={13}/> Exportar</button>
            <button className="tbtn primary" onClick={onCriarUsuario}><Plus size={13}/> Criar acesso</button>
          </div>
        </div>
        <TeamTable members={ENG_TEAM} showEmp empHead="Empresas"/>
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
// Dados — Empresa cliente
// ---------------------------------------------------------------------------
const EMP_TEAM: Member[] = [
  { nome:'Marcos Schiavon',  email:'marcos@logix.ind.br',   funcao:'Coord. DP / RH',     papel:'Administrador', cor:'#F59E0B', status:'ativo', you:true },
  { nome:'Patrícia Almeida', email:'patricia@logix.ind.br', funcao:'Enfermeira do Trab.',  papel:'SESMT',         cor:'#A855F7', status:'ativo' },
  { nome:'Letícia Cardoso',  email:'leticia@logix.ind.br',  funcao:'Téc. Segurança',      papel:'SESMT',         cor:'#8B5CF6', status:'ativo' },
  { nome:'Ana Carla Mendes', email:'ana@logix.ind.br',       funcao:'Analista de RH',      papel:'Operador',      cor:'#06B6D4', status:'ativo' },
  { nome:'Rodrigo Faria',    email:'rodrigo@logix.ind.br',  funcao:'Gerente Industrial',  papel:'Leitura',        cor:'#475569', status:'convite' },
]

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

function MinhaEmpresa({ tab, editing, onCriarUsuario }: { tab: string; editing: boolean; onCriarUsuario: () => void }) {
  if (tab === 'dados') {
    return (
      <div className="row-2" style={{ alignItems:'start' }}>
        <div className="card mp-card">
          <h3>Dados cadastrais</h3>
          <div className="mp-form" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <CfgField label="Razão social" full editing={editing} v="Logix Industrial Ltda"/>
            <CfgField label="Nome fantasia" editing={editing} v="Logix Industrial"/>
            <CfgField label="CNPJ (matriz)" editing={editing} v="34.124.001/0001-12"/>
            <CfgField label="CNAE principal" editing={editing} v="52.50-8 · Logística"/>
            <CfgField label="Grau de risco (NR-4)" editing={editing} v="3"/>
            <CfgField label="Inscrição estadual" editing={editing} v="635.842.119.004"/>
            <CfgField label="Responsável legal" editing={editing} v="Eduardo Logix Pereira"/>
            <CfgField label="E-mail" editing={editing} type="email" v="sst@logix.ind.br"/>
            <CfgField label="Telefone" editing={editing} v="(11) 4071-2200"/>
            <CfgField label="Endereço (matriz)" full editing={editing} v="Rua das Indústrias, 740 · Diadema · SP · 09960-000"/>
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className="card mp-card mp-card-tint">
            <h3>Perfil SST</h3>
            <div className="mp-status-grid">
              <div><div className="mp-mini-l">Colaboradores</div><div className="mp-mini-v">247</div></div>
              <div><div className="mp-mini-l">Unidades</div><div className="mp-mini-v">3</div></div>
              <div><div className="mp-mini-l">Grau de risco</div><div className="mp-mini-v">3</div></div>
              <div><div className="mp-mini-l">Score SST</div><div className="mp-mini-v"><span className="chip ok">89%</span></div></div>
            </div>
          </div>

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
    return (
      <div className="card mp-card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'18px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div>
            <h3 style={{ margin:0 }}>Equipe com acesso à plataforma</h3>
            <p className="mp-card-sub" style={{ margin:'4px 0 0' }}>Usuários da Logix Industrial · RH, DP e SESMT · defina o papel de cada acesso</p>
          </div>
          <button className="tbtn primary" onClick={onCriarUsuario}><Plus size={13}/> Convidar usuário</button>
        </div>
        <TeamTable members={EMP_TEAM}/>
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
  const { empresaId } = useCurrentProfile()
  const isAdmin = profile?.role === 'admin'
  const tabs = isAdmin ? ADMIN_TABS : EMP_TABS
  const [tab, setTab] = useState(tabs[0].id)
  const [editing, setEditing] = useState(false)
  const [showCriarModal, setShowCriarModal] = useState(false)

  useEffect(() => {
    setTab(tabs[0].id)
    setEditing(false)
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
              : 'Logix Industrial · cadastro, unidades, acessos e contrato Norveo'}
          </p>
        </div>
        <div className="toolbar">
          {onDataTab && (
            <button className="tbtn primary is-soon" title="Em breve" onClick={() => comingSoon('Editar dados')}>
              <Pencil size={13}/> Editar dados
            </button>
          )}
          {!onDataTab && <button className="tbtn is-soon" title="Em breve" onClick={() => comingSoon('Central de ajuda')}><HelpCircle size={13}/> Ajuda</button>}
        </div>
      </div>

      <Tabs tabs={tabs} tab={tab} setTab={setTab}/>

      {onCatalogosTab
        ? <CatalogosTab empresaId={empresaId} />
        : isAdmin
          ? <ConfiguracoesAdmin tab={tab} editing={editing} onCriarUsuario={() => setShowCriarModal(true)}/>
          : <MinhaEmpresa tab={tab} editing={editing} onCriarUsuario={() => setShowCriarModal(true)}/>}

      {showCriarModal && empresaId && (
        <CriarUsuarioModal
          adminEmpresaId={empresaId}
          onClose={() => setShowCriarModal(false)}
        />
      )}
    </div>
  )
}
