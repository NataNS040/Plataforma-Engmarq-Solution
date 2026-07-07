import { useState, useEffect } from 'react'
import {
  Building2, Users, Shield, LayoutGrid, Star, MapPin,
  Plus, Download, Pencil, CheckCircle2, Clock, MoreHorizontal,
  Activity, FileText, Calendar, Mail, HelpCircle, Layers,
} from 'lucide-react'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'
import { CatalogosTab } from './CatalogosTab'

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
                <td style={{ textAlign:'center', fontFamily:'Plus Jakarta Sans', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>
                  {m.emp || '—'}
                </td>
              )}
              <td>
                {m.status === 'ativo'
                  ? <span className="chip ok"><CheckCircle2 size={11}/> Ativo</span>
                  : <span className="chip warn"><Clock size={11}/> Convite pendente</span>}
              </td>
              <td style={{ textAlign:'right' }}>
                <button className="icon-btn sm"><MoreHorizontal size={15}/></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// IntCard
// ---------------------------------------------------------------------------
interface IntCardProps {
  icon: React.ElementType; color: string; name: string; desc: string
  kind: string; statusLabel: string; meta: string; btn: string
}

function IntCard({ icon: Icon, color, name, desc, kind, statusLabel, meta, btn }: IntCardProps) {
  const chipKind = kind === 'off' ? '' : kind
  return (
    <div className="card" style={{ padding:16 }}>
      <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
        <div style={{ width:42, height:42, borderRadius:11, display:'grid', placeItems:'center', background:`${color}1A`, color, flexShrink:0 }}>
          <Icon size={20}/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:600, fontSize:13.5 }}>{name}</div>
          <div style={{ fontSize:11.5, color:'var(--ink-500)', marginTop:1 }}>{desc}</div>
        </div>
        {chipKind
          ? <span className={`chip ${chipKind}`}>{statusLabel}</span>
          : <span className="chip" style={{ background:'var(--bg-tint-1)', color:'var(--ink-500)' }}>{statusLabel}</span>}
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:14, paddingTop:12, borderTop:'1px solid var(--border)' }}>
        <span style={{ fontSize:11.5, color:'var(--ink-500)' }}>{meta}</span>
        <button className="tbtn ghost sm">{btn}</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dados — EngMarq (admin)
// ---------------------------------------------------------------------------
const ENG_TEAM: Member[] = [
  { nome:'Renata Almeida',       email:'renata@engmarq.com.br',  funcao:'Coordenadora SST',  papel:'Administrador', emp:24, cor:'#F59E0B', status:'ativo', you:true },
  { nome:'Dr. Aurélio Lima',     email:'aurelio@engmarq.com.br', funcao:'Médico do Trabalho', papel:'Médico',        emp:9,  cor:'#10B981', status:'ativo' },
  { nome:'Dra. Helena Vasquez',  email:'helena@engmarq.com.br',  funcao:'Médica do Trabalho', papel:'Médico',        emp:7,  cor:'#0891B2', status:'ativo' },
  { nome:'Eng. Marcelo Tannous', email:'marcelo@engmarq.com.br', funcao:'Eng. de Segurança',  papel:'Engenheiro',    emp:12, cor:'#3B82F6', status:'ativo' },
  { nome:'Eng. Ana Becker',      email:'ana@engmarq.com.br',     funcao:'Eng. de Segurança',  papel:'Engenheiro',    emp:8,  cor:'#8B5CF6', status:'ativo' },
  { nome:'Rui Campos',           email:'rui@engmarq.com.br',     funcao:'Téc. Segurança',     papel:'Técnico',       emp:15, cor:'#DB2777', status:'ativo' },
  { nome:'Beatriz Nunes',        email:'beatriz@engmarq.com.br', funcao:'Téc. Segurança',     papel:'Técnico',       emp:0,  cor:'#475569', status:'convite' },
]

const ROLES = ['Admin', 'Coord.', 'Eng.', 'Médico', 'Téc.', 'Leitura']
const PERMS = [
  { l:'Gerir empresas-cliente',   v:[1,1,0,0,0,0] },
  { l:'Editar documentos SST',    v:[1,1,1,0,0,0] },
  { l:'Registrar ASO / PCMSO',    v:[1,1,0,1,0,0] },
  { l:'Gerir treinamentos NR',    v:[1,1,1,0,1,0] },
  { l:'Gerir equipe interna',     v:[1,0,0,0,0,0] },
  { l:'Contratos e faturamento',  v:[1,0,0,0,0,0] },
  { l:'Exportar e relatórios',    v:[1,1,1,1,1,1] },
  { l:'Acesso à API',             v:[1,0,0,0,0,0] },
]

const ENG_INTEGRATIONS: IntCardProps[] = [
  { icon:Shield,     color:'#10B981', name:'eSocial',                desc:'Eventos S-2220 / S-2240',   kind:'ok',   statusLabel:'Conectado',     meta:'Última sinc.: hoje, 06:40',  btn:'Configurar' },
  { icon:FileText,   color:'#3B82F6', name:'Certificado Digital A1', desc:'e-CNPJ EngMarq',            kind:'ok',   statusLabel:'Válido',         meta:'Expira 12/12/2026',          btn:'Renovar' },
  { icon:Building2,  color:'#8B5CF6', name:'gov.br · Conectividade', desc:'Procuração eletrônica',     kind:'warn', statusLabel:'Parcial',        meta:'3 empresas pendentes',       btn:'Gerenciar' },
  { icon:LayoutGrid, color:'#F59E0B', name:'ERP / Folha',            desc:'TOTVS · Senior · Domínio',  kind:'off',  statusLabel:'Não conectado',  meta:'Importe colaboradores',      btn:'Conectar' },
  { icon:Calendar,   color:'#0891B2', name:'Agenda de exames',       desc:'Google / Outlook Calendar', kind:'warn', statusLabel:'Parcial',        meta:'1 de 3 clínicas',            btn:'Configurar' },
  { icon:Activity,   color:'#DB2777', name:'API EngMarq',            desc:'Integração via REST',       kind:'ok',   statusLabel:'Ativa',          meta:'2 chaves · sk_live_…a23f',   btn:'Gerenciar' },
]

const ENG_INVOICES = [
  { mes:'Mai / 2026', valor:'R$ 48.600', venc:'10/05/2026', st:'ok', stl:'Pago' },
  { mes:'Abr / 2026', valor:'R$ 48.600', venc:'10/04/2026', st:'ok', stl:'Pago' },
  { mes:'Mar / 2026', valor:'R$ 46.200', venc:'10/03/2026', st:'ok', stl:'Pago' },
  { mes:'Fev / 2026', valor:'R$ 46.200', venc:'10/02/2026', st:'ok', stl:'Pago' },
]

// ---------------------------------------------------------------------------
// Configurações — EngMarq Admin
// ---------------------------------------------------------------------------
const ADMIN_TABS = [
  { id:'conta',       label:'Conta',               icon:Building2 },
  { id:'equipe',      label:'Equipe',              icon:Users },
  { id:'catalogos',   label:'Catálogos',           icon:Layers },
  { id:'papeis',      label:'Papéis e permissões', icon:Shield },
  { id:'integracoes', label:'Integrações',         icon:LayoutGrid },
  { id:'plano',       label:'Plano e faturamento', icon:Star },
]

function ConfiguracoesAdmin({ tab, editing }: { tab: string; editing: boolean }) {
  if (tab === 'conta') {
    return (
      <div className="row-2" style={{ alignItems:'start' }}>
        <div className="card mp-card">
          <h3>Dados da organização</h3>
          <div className="mp-form" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <CfgField label="Razão social" full editing={editing} v="EngMarq Engenharia de Segurança e Saúde do Trabalho Ltda"/>
            <CfgField label="Nome fantasia" editing={editing} v="EngMarq"/>
            <CfgField label="CNPJ" editing={editing} v="18.402.776/0001-55"/>
            <CfgField label="Registro CREA-SP" editing={editing} v="CREA-SP 0.612.487"/>
            <CfgField label="Responsável técnico" editing={editing} v="Eng. Marcelo Tannous"/>
            <CfgField label="E-mail" editing={editing} type="email" v="contato@engmarq.com.br"/>
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
                EngMarq Vision
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button className="tbtn"><Plus size={13}/> Trocar logo</button>
              <button className="tbtn ghost">Cor de marca</button>
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
            <h3 style={{ margin:0 }}>Equipe interna EngMarq</h3>
            <p className="mp-card-sub" style={{ margin:'4px 0 0' }}>{ativos} membros ativos · 1 convite pendente · profissionais alocados às empresas-cliente</p>
          </div>
          <div className="toolbar">
            <button className="tbtn"><Download size={13}/> Exportar</button>
            <button className="tbtn primary"><Plus size={13}/> Convidar membro</button>
          </div>
        </div>
        <TeamTable members={ENG_TEAM} showEmp empHead="Empresas"/>
      </div>
    )
  }

  if (tab === 'papeis') {
    return (
      <div className="row-2" style={{ gridTemplateColumns:'1fr 300px', alignItems:'start' }}>
        <div className="card mp-card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ padding:'18px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
            <div>
              <h3 style={{ margin:0 }}>Matriz de permissões</h3>
              <p className="mp-card-sub" style={{ margin:'4px 0 0' }}>O que cada papel de acesso pode fazer na plataforma</p>
            </div>
            <button className="tbtn"><Pencil size={13}/> Editar papéis</button>
          </div>
          <div style={{ overflow:'auto' }}>
            <table className="tbl matrix-tbl" style={{ minWidth:620 }}>
              <thead>
                <tr>
                  <th style={{ position:'sticky', left:0, background:'var(--surface-2, var(--bg-tint-1))', zIndex:1, minWidth:200 }}>Permissão</th>
                  {ROLES.map(r => <th key={r} style={{ textAlign:'center', minWidth:64 }}>{r}</th>)}
                </tr>
              </thead>
              <tbody>
                {PERMS.map((p, i) => (
                  <tr key={i}>
                    <td style={{ position:'sticky', left:0, background:'var(--surface)', zIndex:1, fontWeight:500, fontSize:12.5 }}>{p.l}</td>
                    {p.v.map((on, j) => (
                      <td key={j} style={{ textAlign:'center' }}>
                        {on
                          ? <span style={{ display:'inline-grid', placeItems:'center', width:22, height:22, borderRadius:6, background:'var(--green-50, #ECFDF5)', color:'var(--green-600)' }}><CheckCircle2 size={14}/></span>
                          : <span style={{ color:'var(--ink-300, #CBD5E1)' }}>—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card mp-card">
          <h3>Papéis de acesso</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { r:'Administrador',  n:1, d:'Acesso total à conta' },
              { r:'Coordenador(a)', n:1, d:'Operação e compliance' },
              { r:'Engenheiro(a)',  n:2, d:'Documentos e laudos' },
              { r:'Médico(a)',      n:2, d:'ASOs e PCMSO' },
              { r:'Técnico(a)',     n:2, d:'Treinamentos e campo' },
              { r:'Somente leitura',n:0, d:'Visualização' },
            ].map((x, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'10px 12px', borderRadius:10, background:'var(--surface-2, var(--bg-tint-1))', border:'1px solid var(--border)' }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12.5, fontWeight:600 }}>{x.r}</div>
                  <div style={{ fontSize:11, color:'var(--ink-500)' }}>{x.d}</div>
                </div>
                <span style={{ fontSize:11.5, color:'var(--ink-500)', fontVariantNumeric:'tabular-nums' }}>{x.n} {x.n === 1 ? 'membro' : 'membros'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (tab === 'integracoes') {
    return (
      <div className="cfg-grid">
        {ENG_INTEGRATIONS.map((it, i) => <IntCard key={i} {...it}/>)}
      </div>
    )
  }

  // plano
  return (
    <div className="row-2" style={{ alignItems:'start' }}>
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        <div className="card mp-card cfg-plan">
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
            <div>
              <div className="cfg-plan-eyebrow">Plano atual</div>
              <div className="cfg-plan-name">EngMarq Enterprise</div>
              <div className="cfg-plan-sub">Empresas ilimitadas · suporte dedicado · SLA 99,9%</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div className="cfg-plan-price">R$ 48.600<span>/mês</span></div>
              <div style={{ fontSize:11.5, color:'var(--ink-500)' }}>ciclo mensal</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button className="tbtn primary"><Star size={13}/> Gerenciar plano</button>
            <button className="tbtn">Ver contrato</button>
          </div>
        </div>

        <div className="card mp-card">
          <h3>Uso do plano</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {[
              { l:'Empresas-cliente',             v:'24',     max:'ilimitado', pct:30 },
              { l:'Colaboradores monitorados',    v:'5.847',  max:'ilimitado', pct:42 },
              { l:'Armazenamento de documentos',  v:'64 GB',  max:'200 GB',    pct:32 },
              { l:'Assentos de equipe',           v:'7',      max:'15',        pct:47 },
            ].map((u, i) => (
              <div key={i}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12.5, marginBottom:6 }}>
                  <span style={{ color:'var(--ink-700)' }}>{u.l}</span>
                  <span style={{ fontFamily:'Plus Jakarta Sans', fontWeight:600 }}>{u.v} <span style={{ color:'var(--ink-400)', fontWeight:400 }}>/ {u.max}</span></span>
                </div>
                <div style={{ height:8, borderRadius:999, background:'var(--bg-tint-1)', overflow:'hidden' }}>
                  <div style={{ width:`${u.pct}%`, height:'100%', background:'var(--orange-500)', borderRadius:999 }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        <div className="card mp-card">
          <h3>Pagamento</h3>
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:10, background:'var(--surface-2, var(--bg-tint-1))', border:'1px solid var(--border)' }}>
            <div style={{ width:38, height:26, borderRadius:5, background:'var(--navy-800, #1E3A5F)', display:'grid', placeItems:'center', color:'#fff', fontSize:9, fontWeight:700 }}>BB</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12.5, fontWeight:600 }}>Boleto + transferência</div>
              <div style={{ fontSize:11, color:'var(--ink-500)' }}>Faturamento mensal · NF-e automática</div>
            </div>
            <button className="tbtn ghost sm">Alterar</button>
          </div>
          <div className="mp-hint" style={{ marginTop:10 }}>Próxima cobrança em <strong>10/06/2026</strong> · R$ 48.600</div>
        </div>

        <div className="card mp-card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ padding:'16px 18px 10px' }}><h3 style={{ margin:0 }}>Histórico de faturas</h3></div>
          <table className="tbl">
            <thead><tr><th>Competência</th><th>Valor</th><th>Status</th><th style={{ textAlign:'right' }}></th></tr></thead>
            <tbody>
              {ENG_INVOICES.map((f, i) => (
                <tr key={i}>
                  <td style={{ fontWeight:500 }}>{f.mes}<div style={{ fontSize:11, color:'var(--ink-500)' }}>venc. {f.venc}</div></td>
                  <td style={{ fontFamily:'Plus Jakarta Sans', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{f.valor}</td>
                  <td><span className="chip ok"><CheckCircle2 size={11}/> {f.stl}</span></td>
                  <td style={{ textAlign:'right' }}><button className="icon-btn sm" title="Baixar NF"><Download size={15}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dados — Empresa cliente (Logix Industrial)
// ---------------------------------------------------------------------------
const EMP_UNITS = [
  { nome:'Matriz · Diadema',      cnpj:'34.124.001/0001-12', cnae:'52.50-8', risco:3, n:168, st:'ativo' },
  { nome:'Filial · São Bernardo', cnpj:'34.124.001/0002-00', cnae:'52.11-7', risco:3, n:54,  st:'ativo' },
  { nome:'CD · Guarulhos',        cnpj:'34.124.001/0003-83', cnae:'52.11-7', risco:2, n:25,  st:'ativo' },
]

const EMP_TEAM: Member[] = [
  { nome:'Marcos Schiavon',  email:'marcos@logix.ind.br',   funcao:'Coord. DP / RH',     papel:'Administrador', cor:'#F59E0B', status:'ativo', you:true },
  { nome:'Patrícia Almeida', email:'patricia@logix.ind.br', funcao:'Enfermeira do Trab.',  papel:'SESMT',         cor:'#A855F7', status:'ativo' },
  { nome:'Letícia Cardoso',  email:'leticia@logix.ind.br',  funcao:'Téc. Segurança',      papel:'SESMT',         cor:'#8B5CF6', status:'ativo' },
  { nome:'Ana Carla Mendes', email:'ana@logix.ind.br',       funcao:'Analista de RH',      papel:'Operador',      cor:'#06B6D4', status:'ativo' },
  { nome:'Rodrigo Faria',    email:'rodrigo@logix.ind.br',  funcao:'Gerente Industrial',  papel:'Leitura',        cor:'#475569', status:'convite' },
]

const EMP_SERVICES = [
  { l:'PGR — Gerenciamento de Riscos', on:true },
  { l:'PCMSO — Controle Médico',       on:true },
  { l:'ASOs ocupacionais',             on:true },
  { l:'Treinamentos NR',               on:true },
  { l:'Laudos técnicos (LTCAT, AET)',  on:true },
  { l:'Envio eSocial (SST)',           on:true },
  { l:'Brigada e plano de emergência', on:false },
]

const EMP_INTEGRATIONS: IntCardProps[] = [
  { icon:Shield,   color:'#10B981', name:'eSocial',                desc:'Eventos S-2220 / S-2240 / S-2210', kind:'ok',   statusLabel:'Sincronizado',  meta:'Último envio: ontem 18:20', btn:'Ver eventos' },
  { icon:FileText, color:'#3B82F6', name:'Certificado Digital A1', desc:'e-CNPJ Logix Industrial',          kind:'warn', statusLabel:'Expira em 40d', meta:'Vence 18/07/2026',          btn:'Renovar' },
  { icon:LayoutGrid,color:'#F59E0B',name:'Folha · TOTVS RM',       desc:'Importação de colaboradores',      kind:'ok',   statusLabel:'Conectado',     meta:'247 colaboradores',          btn:'Configurar' },
]

// ---------------------------------------------------------------------------
// Minha Empresa (empresa cliente)
// ---------------------------------------------------------------------------
const EMP_TABS = [
  { id:'dados',       label:'Dados da empresa',      icon:Building2 },
  { id:'unidades',    label:'Unidades',              icon:MapPin },
  { id:'catalogos',   label:'Catálogos',             icon:Layers },
  { id:'equipe',      label:'Equipe e acessos',      icon:Users },
  { id:'contrato',    label:'Contrato EngMarq',      icon:Shield },
  { id:'integracoes', label:'eSocial e integrações', icon:LayoutGrid },
]

function MinhaEmpresa({ tab, editing }: { tab: string; editing: boolean }) {
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
            <h3>Responsáveis EngMarq</h3>
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
      <div className="card mp-card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'18px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div>
            <h3 style={{ margin:0 }}>Unidades e estabelecimentos</h3>
            <p className="mp-card-sub" style={{ margin:'4px 0 0' }}>3 estabelecimentos · 247 colaboradores · cada unidade com CNPJ e grau de risco próprios</p>
          </div>
          <button className="tbtn primary"><Plus size={13}/> Adicionar unidade</button>
        </div>
        <div style={{ overflow:'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Unidade</th><th>CNPJ</th><th>CNAE</th>
                <th style={{ textAlign:'center' }}>Grau de risco</th>
                <th style={{ textAlign:'center' }}>Colab.</th>
                <th>Status</th>
                <th style={{ textAlign:'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {EMP_UNITS.map((u, i) => (
                <tr key={i}>
                  <td>
                    <div className="cell-person">
                      <div className="ava" style={{ background:'var(--navy-700, #3730A3)', borderRadius:8, color:'#fff', display:'grid', placeItems:'center' }}><Building2 size={15}/></div>
                      <div><div className="name">{u.nome}</div></div>
                    </div>
                  </td>
                  <td style={{ fontVariantNumeric:'tabular-nums', color:'var(--ink-700)' }}>{u.cnpj}</td>
                  <td>{u.cnae}</td>
                  <td style={{ textAlign:'center' }}>
                    <span className="chip" style={{ background: u.risco >= 3 ? 'var(--orange-50)' : 'var(--bg-tint-1)', color: u.risco >= 3 ? 'var(--orange-600)' : 'var(--ink-700)' }}>Grau {u.risco}</span>
                  </td>
                  <td style={{ textAlign:'center', fontFamily:'Plus Jakarta Sans', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{u.n}</td>
                  <td><span className="chip ok"><CheckCircle2 size={11}/> Ativa</span></td>
                  <td style={{ textAlign:'right' }}><button className="icon-btn sm"><MoreHorizontal size={15}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
          <button className="tbtn primary"><Plus size={13}/> Convidar usuário</button>
        </div>
        <TeamTable members={EMP_TEAM}/>
      </div>
    )
  }

  if (tab === 'contrato') {
    return (
      <div className="row-2" style={{ alignItems:'start' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className="card mp-card cfg-plan">
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
              <div>
                <div className="cfg-plan-eyebrow">Contrato de prestação de serviços SST</div>
                <div className="cfg-plan-name">EngMarq · Plano Indústria</div>
                <div className="cfg-plan-sub">Vigência 01/01/2026 — 31/12/2026 · renovação automática</div>
              </div>
              <span className="chip ok" style={{ flexShrink:0 }}><CheckCircle2 size={11}/> Ativo</span>
            </div>
            <div className="mp-status-grid" style={{ marginTop:16 }}>
              <div><div className="mp-mini-l">Mensalidade</div><div className="mp-mini-v">R$ 6.480</div></div>
              <div><div className="mp-mini-l">Colaboradores</div><div className="mp-mini-v">até 300</div></div>
              <div><div className="mp-mini-l">SLA atendimento</div><div className="mp-mini-v">24 h úteis</div></div>
              <div><div className="mp-mini-l">Próx. cobrança</div><div className="mp-mini-v">10/06/2026</div></div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button className="tbtn"><Download size={13}/> Baixar contrato</button>
              <button className="tbtn ghost">Falar com EngMarq</button>
            </div>
          </div>

          <div className="card mp-card">
            <h3>Serviços contratados</h3>
            <div className="mp-perm-list">
              {EMP_SERVICES.map((s, i) => (
                <div key={i} className="mp-perm-row">
                  <span className="mp-perm-l">{s.l}</span>
                  <span className={`mp-perm-flag${s.on ? ' on' : ' off'}`}>
                    {s.on ? <><CheckCircle2 size={12}/> Incluído</> : <>Não contratado</>}
                  </span>
                </div>
              ))}
            </div>
            <p className="mp-card-foot">Para incluir novos serviços, fale com seu coordenador EngMarq.</p>
          </div>
        </div>

        <div className="card mp-card">
          <h3>Equipe EngMarq alocada</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {[
              { nome:'Renata Almeida',       funcao:'Coordenadora da conta',               cor:'#F59E0B' },
              { nome:'Dr. Aurélio Lima',     funcao:'Médico do Trabalho responsável',       cor:'#10B981' },
              { nome:'Eng. Marcelo Tannous', funcao:'Eng. de Segurança · PGR / laudos',     cor:'#3B82F6' },
              { nome:'Rui Campos',           funcao:'Téc. Segurança · treinamentos',        cor:'#DB2777' },
            ].map((r, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:11, padding:'10px 12px', borderRadius:10, background:'var(--surface-2, var(--bg-tint-1))', border:'1px solid var(--border)' }}>
                <Avatar nome={r.nome} cor={r.cor} size={34}/>
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ fontSize:12.5, fontWeight:600 }}>{r.nome}</div>
                  <div style={{ fontSize:11, color:'var(--ink-500)' }}>{r.funcao}</div>
                </div>
                <button className="icon-btn sm" title="Mensagem"><Mail size={15}/></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // integracoes
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div className="glass pcmso" style={{ padding:18 }}>
        <div className="pcmso-doc">
          <div className="pcmso-ic"><Shield size={22}/></div>
          <div style={{ flex:1 }}>
            <div className="pcmso-eyebrow">Integração obrigatória</div>
            <div className="pcmso-title">eSocial · SST</div>
            <div className="pcmso-vig">Responsável: Marcos Schiavon · certificado e-CNPJ A1 · ambiente produção</div>
          </div>
          <div className="pcmso-doc-side">
            <span className="chip ok"><CheckCircle2 size={11}/> Sincronizado</span>
            <button className="tbtn"><Activity size={13}/> Ver eventos</button>
          </div>
        </div>
        <div className="mp-status-grid" style={{ borderTop:'1px solid var(--border)', paddingTop:16 }}>
          <div><div className="mp-mini-l">S-2220 · Monitoramento</div><div className="mp-mini-v"><span className="chip ok">218 enviados</span></div></div>
          <div><div className="mp-mini-l">S-2240 · Condições</div><div className="mp-mini-v"><span className="chip ok">247 enviados</span></div></div>
          <div><div className="mp-mini-l">S-2210 · CAT</div><div className="mp-mini-v"><span className="chip warn">2 pendentes</span></div></div>
          <div><div className="mp-mini-l">Último envio</div><div className="mp-mini-v">ontem 18:20</div></div>
        </div>
      </div>
      <div className="cfg-grid">
        {EMP_INTEGRATIONS.map((it, i) => <IntCard key={i} {...it}/>)}
      </div>
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
              ? 'EngMarq · conta da organização, equipe interna e integrações'
              : 'Logix Industrial · cadastro, unidades, acessos e contrato EngMarq'}
          </p>
        </div>
        <div className="toolbar">
          {onDataTab && (editing
            ? <>
                <button className="tbtn" onClick={() => setEditing(false)}>Cancelar</button>
                <button className="tbtn primary" onClick={() => setEditing(false)}><CheckCircle2 size={13}/> Salvar alterações</button>
              </>
            : <button className="tbtn primary" onClick={() => setEditing(true)}><Pencil size={13}/> Editar dados</button>)}
          {!onDataTab && <button className="tbtn"><HelpCircle size={13}/> Ajuda</button>}
        </div>
      </div>

      <Tabs tabs={tabs} tab={tab} setTab={setTab}/>

      {onCatalogosTab
        ? <CatalogosTab empresaId={empresaId} />
        : isAdmin
          ? <ConfiguracoesAdmin tab={tab} editing={editing}/>
          : <MinhaEmpresa tab={tab} editing={editing}/>}
    </div>
  )
}
