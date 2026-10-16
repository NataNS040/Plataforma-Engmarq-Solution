import { useMemo, useState } from 'react'
import { Ban, Download, Eye, Loader2, Pencil, Plus, ShieldAlert, X } from 'lucide-react'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'
import { useAcidentes, useAnularAcidente, useCatalogosEsocial, useResumoAcidentes } from '@/hooks/queries/useAcidentes'
import { GRAVIDADES, PIRAMIDE, STATUS, TIPOS, type AcidenteResumido } from '@/services/acidentesService'
import { exportToCsv } from '@/lib/csvExport'
import { SoonPanel } from '@/components/ui/SoonPanel'
import { AcidenteModal } from './AcidenteModal'
import { PiramideBird } from './PiramideBird'
import { indicadores, noPeriodo } from './regras'

const brDate = (s: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—')
const featureOff = (err: unknown) => (err as { code?: string } | null)?.code === 'feature_not_enabled'
const GRAVIDADE_CHIP: Record<AcidenteResumido['gravidade'], string> = {
  sem_lesao: 'neutral', leve: 'ok', moderada: 'warn', grave: 'crit', fatal: 'crit',
}

function AnularDialog({ acidente, onClose }: { acidente: AcidenteResumido; onClose: () => void }) {
  const [motivo, setMotivo] = useState('')
  const anular = useAnularAcidente()
  const valido = motivo.trim().length >= 3
  return (
    <div className="modal-backdrop">
      <form className="modal" style={{ maxWidth: 460 }} onSubmit={e => {
        e.preventDefault()
        if (valido) void anular.mutateAsync({ id: acidente.id, motivo: motivo.trim() }).then(onClose).catch(() => undefined)
      }}>
        <div className="modal-head"><h2>Anular registro?</h2>
          <button type="button" className="icon-btn" aria-label="Fechar" disabled={anular.isPending} onClick={onClose}><X size={16} /></button></div>
        <div className="modal-body">
          <p>Acidentes não são excluídos: o registro de {acidente.colaborador?.nome ?? 'colaborador'} em {brDate(acidente.data_acidente)} fica
            no histórico como anulado, com o seu nome e a data. Esta ação não pode ser desfeita.</p>
          <div className="mp-field">
            <label htmlFor="ac-motivo">Motivo da anulação</label>
            <textarea id="ac-motivo" className="mp-input ac-textarea" maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: registro duplicado" />
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="tbtn" disabled={anular.isPending} onClick={onClose}>Cancelar</button>
          <button className="tbtn danger" disabled={!valido || anular.isPending}>{anular.isPending ? 'Anulando…' : 'Anular registro'}</button>
        </div>
      </form>
    </div>
  )
}

export default function AcidentesPage() {
  const { empresaId, canReadAcidentes, canManageAcidentes } = useCurrentProfile()
  const lista = useAcidentes()
  const resumo = useResumoAcidentes()
  const catalogos = useCatalogosEsocial()
  const [periodo, setPeriodo] = useState('12m')
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('all')
  const [gravidade, setGravidade] = useState('all')
  const [status, setStatus] = useState('all')
  const [anulados, setAnulados] = useState(false)
  const [aberto, setAberto] = useState<{ id?: string; leitura: boolean } | null>(null)
  const [anular, setAnular] = useState<AcidenteResumido | null>(null)

  const anos = useMemo(() => {
    const set = new Set([String(new Date().getFullYear())])
    for (const r of resumo.data ?? []) set.add(r.mes.slice(0, 4))
    return [...set].sort().reverse()
  }, [resumo.data])
  const kpi = useMemo(() => indicadores((resumo.data ?? []).filter(r => noPeriodo(r.mes, periodo))), [resumo.data, periodo])
  const rows = useMemo(() => (lista.data ?? []).filter(r => noPeriodo(r.data_acidente, periodo)
    && (anulados || !r.anulado_em)
    && (tipo === 'all' || r.tipo === tipo) && (gravidade === 'all' || r.gravidade === gravidade)
    && (status === 'all' || r.status === status)
    && `${r.colaborador?.nome ?? ''} ${r.colaborador?.setor?.nome ?? ''}`.toLowerCase().includes(busca.toLowerCase())),
  [lista.data, periodo, anulados, tipo, gravidade, status, busca])

  if (!canReadAcidentes) {
    return <div className="content"><h1>Acidentes de trabalho</h1><p>Registros de acidentes restritos à equipe da empresa.</p></div>
  }
  if (featureOff(lista.error) || featureOff(resumo.error)) {
    return <div className="content"><h1>Acidentes de trabalho</h1>
      <SoonPanel icon={ShieldAlert} title="Módulo de acidentes não habilitado"
        subtitle="O registro de acidentes ainda não está ativo para a sua empresa. Fale com o suporte Norveo para habilitar." /></div>
  }
  const desc = catalogos.data?.descricao
  const carregandoKpi = resumo.isLoading || resumo.isError

  return <div className="content">
    <div className="page-header">
      <div><h1>Acidentes de trabalho</h1><p className="sub">Registro, investigação e Pirâmide de Bird · códigos eSocial S-2210</p></div>
      <div className="toolbar">
        <select className="mp-input" aria-label="Período" value={periodo} onChange={e => setPeriodo(e.target.value)}>
          <option value="12m">Últimos 12 meses</option>
          {anos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button className="tbtn" disabled={lista.isLoading || lista.isError} onClick={() => exportToCsv('acidentes.csv', [
          { header: 'Data', value: (r: AcidenteResumido) => brDate(r.data_acidente) },
          { header: 'Colaborador', value: r => r.colaborador?.nome ?? '' },
          { header: 'Setor', value: r => r.colaborador?.setor?.nome ?? '' },
          { header: 'Tipo', value: r => TIPOS[r.tipo] },
          { header: 'Gravidade', value: r => GRAVIDADES[r.gravidade] },
          { header: 'Pirâmide de Bird', value: r => (r.piramide_bird ? PIRAMIDE[r.piramide_bird] : '') },
          { header: 'Parte atingida (T13)', value: r => (desc && r.codigo_parte_atingida ? `${r.codigo_parte_atingida} - ${desc('13', r.codigo_parte_atingida)}` : '') },
          { header: 'Natureza da lesão (T17)', value: r => (desc && r.codigo_natureza_lesao ? `${r.codigo_natureza_lesao} - ${desc('17', r.codigo_natureza_lesao)}` : '') },
          { header: 'Afastamento', value: r => (r.houve_afastamento ? 'Sim' : 'Não') },
          { header: 'Dias perdidos', value: r => r.dias_perdidos ?? '' },
          { header: 'Emitir CAT', value: r => (r.emitir_cat ? 'Sim' : 'Não') },
          { header: 'Status', value: r => (r.anulado_em ? 'Anulado' : STATUS[r.status]) },
        ], rows)}><Download size={14} /> Exportar</button>
        {canManageAcidentes && <button className="tbtn primary" onClick={() => setAberto({ leitura: false })}><Plus size={14} /> Registrar acidente</button>}
      </div>
    </div>

    <div className="kpi-row">
      {([['Registros', kpi.total], ['Com afastamento', kpi.afastamento], ['Dias perdidos', kpi.dias],
        ['Graves e fatais', kpi.graves], ['CAT a emitir', kpi.cat]] as const).map(([label, valor]) => (
        <div className="glass kpi" key={label}><div className="kpi-label">{label}</div>
          <div className="kpi-value">{carregandoKpi ? '—' : valor}</div></div>
      ))}
    </div>

    <div className="ac-layout">
      <div className="glass" style={{ padding: 20 }}>
        <div className="ctitle">Pirâmide de Bird</div>
        <div className="csub" style={{ marginBottom: 14 }}>Registros não anulados no período</div>
        {resumo.isLoading ? <p><Loader2 size={16} /> Carregando…</p>
          : resumo.isError ? <p role="alert">{resumo.error.message}</p>
          : <PiramideBird contagem={kpi.bird} semClassificacao={kpi.semClassificacao} />}
      </div>

      <div className="glass" style={{ padding: 20, minWidth: 0 }}>
        <div className="toolbar" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          <input className="mp-input" aria-label="Buscar acidente" placeholder="Buscar colaborador ou setor" value={busca} onChange={e => setBusca(e.target.value)} />
          <select className="mp-input" aria-label="Filtrar tipo" value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="all">Todos os tipos</option>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select className="mp-input" aria-label="Filtrar gravidade" value={gravidade} onChange={e => setGravidade(e.target.value)}>
            <option value="all">Todas as gravidades</option>{Object.entries(GRAVIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select className="mp-input" aria-label="Filtrar status" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="all">Todos os status</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <label className="ac-check"><input type="checkbox" checked={anulados} onChange={e => setAnulados(e.target.checked)} /> Mostrar anulados</label>
        </div>
        {lista.isLoading ? <p><Loader2 size={16} /> Carregando acidentes…</p>
          : lista.isError ? <div role="alert"><p>{lista.error.message}</p><button className="tbtn" onClick={() => void lista.refetch()}>Tentar novamente</button></div>
          : <div style={{ overflowX: 'auto' }}><table className="tbl"><thead><tr>
              <th>Data</th><th>Colaborador</th><th>Tipo</th><th>Gravidade</th><th>Parte atingida</th><th>Natureza da lesão</th>
              <th>Afastamento</th><th>Status</th><th>Ações</th></tr></thead><tbody>
            {rows.length === 0 && <tr><td colSpan={9}>Nenhum acidente encontrado no período.</td></tr>}
            {rows.map(r => <tr key={r.id} className={r.anulado_em ? 'ac-row-anulado' : undefined}>
              <td>{brDate(r.data_acidente)}</td>
              <td>{r.colaborador?.nome ?? '—'}<div className="ac-sub">{r.colaborador?.setor?.nome ?? ''}</div></td>
              <td>{TIPOS[r.tipo]}</td>
              <td><span className={`chip ${GRAVIDADE_CHIP[r.gravidade]}`}>{GRAVIDADES[r.gravidade]}</span></td>
              <td>{desc ? desc('13', r.codigo_parte_atingida) : '…'}</td>
              <td>{desc ? desc('17', r.codigo_natureza_lesao) : '…'}</td>
              <td>{r.houve_afastamento ? `Sim${r.dias_perdidos !== null ? ` · ${r.dias_perdidos} dias` : ''}` : 'Não'}</td>
              <td>{r.anulado_em ? <span className="chip neutral">Anulado</span> : STATUS[r.status]}</td>
              <td><div className="toolbar">
                <button className="icon-btn" title="Ver acidente" onClick={() => setAberto({ id: r.id, leitura: true })}><Eye size={15} /></button>
                {canManageAcidentes && !r.anulado_em && <>
                  <button className="icon-btn" title="Editar acidente" onClick={() => setAberto({ id: r.id, leitura: false })}><Pencil size={15} /></button>
                  <button className="icon-btn danger" title="Anular registro" onClick={() => setAnular(r)}><Ban size={15} /></button>
                </>}
              </div></td>
            </tr>)}
          </tbody></table></div>}
      </div>
    </div>

    {aberto && empresaId && <AcidenteModal acidenteId={aberto.id} empresaId={empresaId}
      somenteLeitura={aberto.leitura || !canManageAcidentes} onClose={() => setAberto(null)} />}
    {anular && <AnularDialog acidente={anular} onClose={() => setAnular(null)} />}
  </div>
}
