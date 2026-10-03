import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Download, Eye, Trash2, Pencil, X, Loader2 } from 'lucide-react'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'
import { useExames, useCriarExame, useAtualizarExame, useDeletarExame, useExamesCatalogo } from '@/hooks/queries/useExames'
import { useColaboradores } from '@/hooks/queries/useColaboradores'
import { abrirAso, uploadAsoArquivo, type AsoComDetalhes, type AsoInput } from '@/services/examesService'
import { qk } from '@/lib/queryKeys'
import { exportToCsv } from '@/lib/csvExport'
import type { SubtipoExame, Documento } from '@/types/database'

export const SUBTIPOS: Record<SubtipoExame, string> = {
  admissional: 'Admissional', periodico: 'Periódico', retorno_trabalho: 'Retorno ao trabalho',
  mudanca_risco: 'Mudança de risco ocupacional', demissional: 'Demissional',
}
export const RESULTADOS = { apto: 'Apto', apto_com_restricao: 'Apto com restrição', inapto: 'Inapto' }
export const STATUS = { vigente: 'Vigente', vencendo: 'Vencendo', vencido: 'Vencido' }
export const subtipoLabel = (s: SubtipoExame | null) => s ? SUBTIPOS[s] : 'Não informado (legado)'
export const resultadoLabel = (s: Documento['resultado_aso']) => s ? RESULTADOS[s] : 'Não informado'
const brDate = (s: string | null) => s ? s.split('-').reverse().join('/') : 'Não informado'

function AsoModal({ empresaId, aso, onClose }: { empresaId: string; aso?: AsoComDetalhes; onClose: () => void }) {
  const [colaborador, setColaborador] = useState(aso?.colaborador_id ?? '')
  const [subtipo, setSubtipo] = useState<SubtipoExame | ''>(aso?.subtipo_exame ?? '')
  const [emissao, setEmissao] = useState(aso?.emissao ?? '')
  const [vencimento, setVencimento] = useState(aso?.vencimento ?? '')
  const [resultado, setResultado] = useState<NonNullable<Documento['resultado_aso']> | ''>(aso?.resultado_aso ?? '')
  const [observacoes, setObservacoes] = useState(aso?.observacoes ?? '')
  const [procedimentos, setProcedimentos] = useState(aso?.exames_realizados ?? [])
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const colabs = useColaboradores(empresaId)
  const catalog = useExamesCatalogo()
  const criar = useCriarExame()
  const editar = useAtualizarExame()
  const qc = useQueryClient()

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!colaborador || !subtipo) { setError('Informe colaborador e subtipo.'); return }
    if (emissao && vencimento && vencimento < emissao) { setError('Vencimento anterior à emissão.'); return }
    if (file && (file.type !== 'application/pdf' || file.size > 10485760)) { setError('Envie PDF de até 10 MB.'); return }
    setBusy(true)
    let row: AsoComDetalhes | undefined
    try {
      const colab = colabs.data?.find(c => c.id === colaborador)
      const input: AsoInput = { empresa_id: empresaId, colaborador_id: colaborador, subtipo_exame: subtipo,
        titulo: aso?.titulo ?? `ASO — ${colab?.nome ?? 'Colaborador'}`, emissao: emissao || null,
        vencimento: vencimento || null, resultado_aso: resultado || null, observacoes: observacoes || null,
        exames_realizados: procedimentos }
      if (aso) {
        // Only send changed fields so untouched legacy observations/arrays/dates remain byte-for-byte intact.
        const patch: Partial<Omit<AsoInput, 'empresa_id'>> = {}
        if (colaborador !== aso.colaborador_id) patch.colaborador_id = colaborador
        if (subtipo !== aso.subtipo_exame) patch.subtipo_exame = subtipo
        if (emissao !== (aso.emissao ?? '')) patch.emissao = emissao || null
        if (vencimento !== (aso.vencimento ?? '')) patch.vencimento = vencimento || null
        if (resultado !== (aso.resultado_aso ?? '')) patch.resultado_aso = resultado || null
        if (observacoes !== (aso.observacoes ?? '')) patch.observacoes = observacoes || null
        if (JSON.stringify(procedimentos) !== JSON.stringify(aso.exames_realizados ?? [])) patch.exames_realizados = procedimentos
        row = Object.keys(patch).length ? await editar.mutateAsync({ id: aso.id, empresaId,
          colaboradorId: colaborador, input: patch }) : aso
      } else row = await criar.mutateAsync(input)
      setSaved(true)
      if (file) await uploadAsoArquivo(row.id, file)
      await Promise.all([qc.invalidateQueries({ queryKey: qk.exames.all }),
        qc.invalidateQueries({ queryKey: qk.documentos.all }), qc.invalidateQueries({ queryKey: qk.dashboard.all })])
      onClose()
    } catch (err) {
      if (row) {
        await qc.invalidateQueries({ queryKey: qk.exames.all })
        setError('ASO salvo. Não foi possível confirmar o anexo; feche e edite o registro para conferir o arquivo.')
      } else setError(err instanceof Error ? err.message : 'Não foi possível salvar o ASO.')
    } finally { setBusy(false) }
  }
  return <div className="modal-backdrop"><form className="modal" style={{ maxWidth: 600 }} onSubmit={e => void save(e)}>
    <div className="modal-head"><h2>{aso ? 'Editar ASO' : 'Registrar ASO'}</h2><button type="button" className="icon-btn" disabled={busy} onClick={onClose}><X size={16}/></button></div>
    <div className="modal-body"><div className="mp-form">
      <label>Colaborador<select className="mp-input" value={colaborador} onChange={e => setColaborador(e.target.value)} disabled={busy || colabs.isLoading}>
        <option value="">Selecione</option>{colabs.data?.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select></label>
      <label>Subtipo<select className="mp-input" value={subtipo} onChange={e => setSubtipo(e.target.value as SubtipoExame)}>
        <option value="">Não informado</option>{Object.entries(SUBTIPOS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
      </select></label>
      <label>Data de emissão<input className="mp-input" type="date" value={emissao} onChange={e => setEmissao(e.target.value)}/></label>
      <label>Vencimento (quando aplicável)<input className="mp-input" type="date" value={vencimento} onChange={e => setVencimento(e.target.value)}/></label>
      <label>Resultado informado<select className="mp-input" value={resultado} onChange={e => setResultado(e.target.value as typeof resultado)}>
        <option value="">Não informado</option>{Object.entries(RESULTADOS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
      </select></label>
      <label>Observações<textarea className="mp-input" value={observacoes} onChange={e => setObservacoes(e.target.value)}/></label>
      <fieldset><legend>Procedimentos realizados</legend>{catalog.data?.map(p => <label key={p.id} style={{ display: 'block' }}>
        <input type="checkbox" checked={procedimentos.includes(p.nome)} onChange={() => setProcedimentos(old => old.includes(p.nome) ? old.filter(x => x !== p.nome) : [...old,p.nome])}/> {p.nome}
      </label>)}</fieldset>
      <label>PDF opcional (até 10 MB)<input type="file" accept="application/pdf,.pdf" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
      {aso?.arquivo_path || aso?.arquivo_url ? <p>O arquivo atual será preservado; um novo anexo substitui a referência.</p> : null}
      {(colabs.isError || catalog.isError) && <p role="alert">Não foi possível carregar colaboradores ou procedimentos.</p>}
      {error && <p role="alert">{error}</p>}
    </div></div>
    <div className="modal-foot"><button type="button" className="tbtn" disabled={busy} onClick={onClose}>Fechar</button>
      <button className="tbtn primary" disabled={busy || saved || colabs.isLoading || catalog.isLoading || colabs.isError || catalog.isError}>{busy ? 'Salvando…' : 'Salvar ASO'}</button></div>
  </form></div>
}

export default function ExamesPage() {
  const { empresaId, canReadColaboradores, canManageColaboradores } = useCurrentProfile()
  const query = useExames(canReadColaboradores ? empresaId : undefined)
  const deletar = useDeletarExame()
  const [edit, setEdit] = useState<AsoComDetalhes | 'new' | null>(null)
  const [remove, setRemove] = useState<AsoComDetalhes | null>(null)
  const [search, setSearch] = useState('')
  const [subtipo, setSubtipo] = useState('all')
  const [status, setStatus] = useState('all')
  if (!canReadColaboradores) return <div className="content"><h1>Exames / ASO</h1><p>Registros individuais restritos à equipe da empresa.</p></div>
  const rows = (query.data ?? []).filter(r => (subtipo === 'all' || r.subtipo_exame === subtipo)
    && (status === 'all' || r.status === status)
    && `${r.colaborador?.nome ?? ''} ${r.titulo}`.toLowerCase().includes(search.toLowerCase()))
  async function open(id: string, download = false) {
    try { await abrirAso(id, download) } catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível acessar o arquivo.') }
  }
  return <div className="content">
    <div className="page-header"><div><h1>Exames / ASO</h1><p className="sub">Vencimento informado · alerta em 30 dias</p></div><div className="toolbar">
      <button className="tbtn" disabled={query.isLoading || query.isError} onClick={() => exportToCsv('asos.csv', [
        { header: 'Colaborador', value: r => r.colaborador?.nome ?? 'Não informado' },
        { header: 'Subtipo', value: r => subtipoLabel(r.subtipo_exame) },
        { header: 'Emissão', value: r => r.emissao ?? '' }, { header: 'Vencimento', value: r => r.vencimento ?? '' },
        { header: 'Resultado', value: r => resultadoLabel(r.resultado_aso) }, { header: 'Status', value: r => STATUS[r.status] },
      ], rows)}><Download size={14}/> Exportar</button>
      {canManageColaboradores && <button className="tbtn primary" onClick={() => setEdit('new')}><Plus size={14}/> Registrar ASO</button>}
    </div></div>
    <div className="kpi-row">{Object.entries(STATUS).map(([k,v]) => <div className="glass kpi" key={k}><div className="kpi-label">{v}</div>
      <div className="kpi-value">{query.isError || query.isLoading ? '—' : query.data?.filter(r => r.status === k).length ?? 0}</div></div>)}</div>
    <div className="glass" style={{ padding: 20 }}><div className="toolbar">
      <input className="mp-input" aria-label="Buscar ASO" placeholder="Buscar colaborador" value={search} onChange={e => setSearch(e.target.value)}/>
      <select className="mp-input" aria-label="Filtrar subtipo" value={subtipo} onChange={e => setSubtipo(e.target.value)}><option value="all">Todos os subtipos</option>{Object.entries(SUBTIPOS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select className="mp-input" aria-label="Filtrar status" value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todos os status</option>{Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>
    </div>
      {query.isLoading ? <p><Loader2 size={16}/> Carregando ASOs…</p> : query.isError ? <div role="alert"><p>{query.error.message}</p><button className="tbtn" onClick={() => void query.refetch()}>Tentar novamente</button></div> :
      <div style={{ overflowX: 'auto' }}><table className="tbl"><thead><tr><th>Colaborador</th><th>Subtipo</th><th>Emissão</th><th>Vencimento</th><th>Resultado</th><th>Procedimentos</th><th>Status</th><th>Ações</th></tr></thead><tbody>
        {rows.length === 0 && <tr><td colSpan={8}>Nenhum ASO encontrado.</td></tr>}
        {rows.map(r => <tr key={r.id}><td>{r.colaborador?.nome ?? 'Não informado (legado)'}</td><td>{subtipoLabel(r.subtipo_exame)}</td>
          <td>{brDate(r.emissao)}</td><td>{brDate(r.vencimento)}</td><td>{resultadoLabel(r.resultado_aso)}</td><td>{r.exames_realizados?.join('; ') || 'Não informado'}</td>
          <td><span className={`chip ${r.status === 'vencido' ? 'crit' : r.status === 'vencendo' ? 'warn' : 'ok'}`}>{STATUS[r.status]}</span></td>
          <td><div className="toolbar"><button className="icon-btn" title="Visualizar arquivo" disabled={!r.arquivo_path && !r.arquivo_url} onClick={() => void open(r.id)}><Eye size={15}/></button>
            <button className="icon-btn" title="Baixar arquivo" disabled={!r.arquivo_path && !r.arquivo_url} onClick={() => void open(r.id,true)}><Download size={15}/></button>
            {canManageColaboradores && <><button className="icon-btn" title="Editar ASO" onClick={() => setEdit(r)}><Pencil size={15}/></button><button className="icon-btn danger" title="Excluir ASO" onClick={() => setRemove(r)}><Trash2 size={15}/></button></>}
          </div></td></tr>)}
      </tbody></table></div>}
    </div>
    {edit && empresaId && <AsoModal empresaId={empresaId} aso={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)}/>}
    {remove && empresaId && <div className="modal-backdrop"><div className="modal"><div className="modal-body"><h2>Excluir ASO?</h2><p>O registro será removido permanentemente. O arquivo será preservado.</p></div><div className="modal-foot">
      <button className="tbtn" disabled={deletar.isPending} onClick={() => setRemove(null)}>Cancelar</button><button className="tbtn danger" disabled={deletar.isPending} onClick={() => void deletar.mutateAsync({id: remove.id,empresaId,colaboradorId: remove.colaborador_id}).then(() => setRemove(null)).catch(() => undefined)}>Excluir</button>
    </div></div></div>}
  </div>
}
