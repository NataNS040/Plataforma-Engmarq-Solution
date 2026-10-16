import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { useColaboradores } from '@/hooks/queries/useColaboradores'
import { useAcidente, useAtualizarAcidente, useCatalogosEsocial, useCriarAcidente } from '@/hooks/queries/useAcidentes'
import {
  GRAVIDADES, LATERALIDADE, LOCAIS, PIRAMIDE, STATUS, TIPOS,
  type Acidente, type AcidenteInput,
} from '@/services/acidentesService'
import { inicial, paraInput, validar, type Form } from './regras'
import type { CatalogosEsocial } from '@/lib/esocial'
import { CodigoEsocialSelect } from './CodigoEsocialSelect'


function FormAcidente({ acidente, empresaId, catalogos, somenteLeitura, onClose }: {
  acidente?: Acidente
  empresaId: string
  catalogos: CatalogosEsocial
  somenteLeitura: boolean
  onClose: () => void
}) {
  const [form, setForm] = useState<Form>(() => inicial(acidente))
  const [erro, setErro] = useState('')
  const colabs = useColaboradores(empresaId)
  const criar = useCriarAcidente()
  const editar = useAtualizarAcidente()
  const busy = criar.isPending || editar.isPending
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(old => ({ ...old, [k]: v }))
  const doenca = form.tipo === 'doenca'
  const bloqueado = somenteLeitura || busy

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setErro('')
    const problema = validar(form)
    if (problema) { setErro(problema); return }
    const input = paraInput(form)
    try {
      if (acidente) {
        // Só os campos alterados: valores antigos que o usuário não mexeu ficam intactos.
        const antes = paraInput(inicial(acidente))
        const patch = Object.fromEntries(Object.entries(input).filter(([k, v]) => antes[k as keyof AcidenteInput] !== v))
        if (Object.keys(patch).length) await editar.mutateAsync({ id: acidente.id, input: patch })
      } else await criar.mutateAsync(input)
      onClose()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar o acidente.')
    }
  }

  return (
    <form className="modal ac-modal" onSubmit={e => void salvar(e)}>
      <div className="modal-head">
        <h2>{acidente ? (somenteLeitura ? 'Acidente' : 'Editar acidente') : 'Registrar acidente'}</h2>
        <button type="button" className="icon-btn" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={16} /></button>
      </div>
      <div className="modal-body">
        {acidente?.anulado_em && (
          <p className="ac-anulado" role="status">Registro anulado: {acidente.motivo_anulacao}</p>
        )}
        <fieldset className="ac-section" disabled={bloqueado}>
          <legend>Identificação</legend>
          <div className="ac-grid">
            <div className="mp-field ac-span">
              <label htmlFor="ac-colab">Colaborador</label>
              <select id="ac-colab" className="mp-input" value={form.colaborador_id} onChange={e => set('colaborador_id', e.target.value)}>
                <option value="">Selecione</option>
                {acidente?.colaborador && !colabs.data?.some(c => c.id === acidente.colaborador_id) && (
                  <option value={acidente.colaborador_id}>{acidente.colaborador.nome}</option>
                )}
                {colabs.data?.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="mp-field">
              <label htmlFor="ac-tipo">Tipo</label>
              <select id="ac-tipo" className="mp-input" value={form.tipo} onChange={e => set('tipo', e.target.value as Form['tipo'])}>
                <option value="">Selecione</option>
                {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="mp-field">
              <label htmlFor="ac-data">Data</label>
              <input id="ac-data" className="mp-input" type="date" value={form.data_acidente} onChange={e => set('data_acidente', e.target.value)} />
            </div>
            {!doenca && <>
              <div className="mp-field">
                <label htmlFor="ac-hora">Hora do acidente</label>
                <input id="ac-hora" className="mp-input" type="time" value={form.hora_acidente} onChange={e => set('hora_acidente', e.target.value)} />
              </div>
              <div className="mp-field">
                <label htmlFor="ac-horas">Horas trabalhadas antes (HH:MM)</label>
                <input id="ac-horas" className="mp-input" inputMode="numeric" placeholder="03:30" value={form.horas_antes} onChange={e => set('horas_antes', e.target.value)} />
              </div>
            </>}
            <div className="mp-field">
              <label htmlFor="ac-local">Local</label>
              <select id="ac-local" className="mp-input" value={form.local_tipo} onChange={e => set('local_tipo', e.target.value)}>
                <option value="">Não informado</option>
                {Object.entries(LOCAIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="mp-field">
              <label htmlFor="ac-local-desc">Especificação do local</label>
              <input id="ac-local-desc" className="mp-input" maxLength={255} placeholder="Pátio, rampa, posto de trabalho…" value={form.local_descricao} onChange={e => set('local_descricao', e.target.value)} />
            </div>
          </div>
        </fieldset>

        <fieldset className="ac-section" disabled={bloqueado}>
          <legend>Lesão e causas (eSocial S-2210)</legend>
          <div className="ac-grid">
            <CodigoEsocialSelect label="Parte do corpo atingida (Tabela 13)" codigos={catalogos.tabelas['13']}
              value={form.codigo_parte_atingida} onChange={v => set('codigo_parte_atingida', v)} />
            <div className="mp-field">
              <label htmlFor="ac-lat">Lateralidade</label>
              <select id="ac-lat" className="mp-input" value={form.lateralidade} disabled={!form.codigo_parte_atingida} onChange={e => set('lateralidade', e.target.value)}>
                <option value="">Não informado</option>
                {Object.entries(LATERALIDADE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {doenca && (
              <div className="mp-field ac-span">
                <label htmlFor="ac-agente-tab">Agente causador da doença</label>
                <select id="ac-agente-tab" className="mp-input" value={form.agente_tabela}
                  onChange={e => setForm(old => ({ ...old, agente_tabela: e.target.value as Form['agente_tabela'], codigo_agente_causador: '' }))}>
                  <option value="14">Tabela 14 — agente causador</option>
                  <option value="15">Tabela 15 — agente / situação geradora de doença</option>
                </select>
              </div>
            )}
            <div className="ac-span">
              <CodigoEsocialSelect
                label={`Agente causador (Tabela ${doenca && form.agente_tabela === '15' ? '15' : '14'})`}
                codigos={catalogos.tabelas[doenca && form.agente_tabela === '15' ? '15' : '14']}
                value={form.codigo_agente_causador} onChange={v => set('codigo_agente_causador', v)} />
            </div>
            <div className="ac-span">
              <CodigoEsocialSelect label="Situação geradora (Tabela 15)" codigos={catalogos.tabelas['15']}
                value={form.codigo_situacao_geradora} onChange={v => set('codigo_situacao_geradora', v)} />
            </div>
            <CodigoEsocialSelect label="Natureza da lesão (Tabela 17)" codigos={catalogos.tabelas['17']}
              value={form.codigo_natureza_lesao} onChange={v => set('codigo_natureza_lesao', v)} />
            <div className="mp-field">
              <label htmlFor="ac-lesao">Descrição complementar da lesão</label>
              <input id="ac-lesao" className="mp-input" maxLength={200} value={form.descricao_lesao} onChange={e => set('descricao_lesao', e.target.value)} />
            </div>
          </div>
        </fieldset>

        <fieldset className="ac-section" disabled={bloqueado}>
          <legend>Classificação e consequências</legend>
          <div className="ac-grid">
            <div className="mp-field">
              <label htmlFor="ac-grav">Gravidade</label>
              <select id="ac-grav" className="mp-input" value={form.gravidade} onChange={e => set('gravidade', e.target.value as Form['gravidade'])}>
                <option value="">Selecione</option>
                {Object.entries(GRAVIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="mp-field">
              <label htmlFor="ac-bird">Pirâmide de Bird</label>
              <select id="ac-bird" className="mp-input" value={form.piramide_bird} onChange={e => set('piramide_bird', e.target.value)}>
                <option value="">Não classificado</option>
                {Object.entries(PIRAMIDE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <label className="ac-check"><input type="checkbox" checked={form.houve_afastamento} onChange={e => set('houve_afastamento', e.target.checked)} /> Houve afastamento</label>
            <div className="mp-field">
              <label htmlFor="ac-ultimo">Último dia trabalhado</label>
              <input id="ac-ultimo" className="mp-input" type="date" value={form.ultimo_dia_trabalhado} onChange={e => set('ultimo_dia_trabalhado', e.target.value)} />
            </div>
            {form.houve_afastamento && <>
              <div className="mp-field">
                <label htmlFor="ac-retorno">Data de retorno</label>
                <input id="ac-retorno" className="mp-input" type="date" value={form.data_retorno} onChange={e => set('data_retorno', e.target.value)} />
              </div>
              <div className="mp-field">
                <label htmlFor="ac-dias">Dias perdidos</label>
                <input id="ac-dias" className="mp-input" type="number" min={0} max={36500} value={form.dias_perdidos} onChange={e => set('dias_perdidos', e.target.value)} />
              </div>
            </>}
            <label className="ac-check"><input type="checkbox" checked={form.houve_obito} onChange={e => set('houve_obito', e.target.checked)} /> Houve óbito</label>
            {form.houve_obito && (
              <div className="mp-field">
                <label htmlFor="ac-obito">Data do óbito</label>
                <input id="ac-obito" className="mp-input" type="date" value={form.data_obito} onChange={e => set('data_obito', e.target.value)} />
              </div>
            )}
            <label className="ac-check"><input type="checkbox" checked={form.comunicado_policia} onChange={e => set('comunicado_policia', e.target.checked)} /> Comunicado à autoridade policial</label>
            <label className="ac-check"><input type="checkbox" checked={form.emitir_cat} onChange={e => set('emitir_cat', e.target.checked)} /> Emitir CAT</label>
            {form.emitir_cat && (
              <div className="mp-field">
                <label htmlFor="ac-recibo">Recibo da CAT (se já emitida)</label>
                <input id="ac-recibo" className="mp-input" maxLength={23} value={form.numero_recibo_cat} onChange={e => set('numero_recibo_cat', e.target.value)} />
              </div>
            )}
          </div>
        </fieldset>

        <fieldset className="ac-section" disabled={bloqueado}>
          <legend>Investigação</legend>
          <div className="ac-grid">
            <div className="mp-field">
              <label htmlFor="ac-status">Status</label>
              <select id="ac-status" className="mp-input" value={form.status} onChange={e => set('status', e.target.value as Form['status'])}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="mp-field ac-span">
              <label htmlFor="ac-detalhes">Descrição do ocorrido</label>
              <textarea id="ac-detalhes" className="mp-input ac-textarea" maxLength={4000} value={form.detalhes} onChange={e => set('detalhes', e.target.value)} />
            </div>
          </div>
        </fieldset>
        {colabs.isError && <p role="alert">Não foi possível carregar os colaboradores.</p>}
        {erro && <p role="alert" className="ac-erro">{erro}</p>}
      </div>
      <div className="modal-foot">
        <button type="button" className="tbtn" disabled={busy} onClick={onClose}>Fechar</button>
        {!somenteLeitura && <button className="tbtn primary" disabled={busy || colabs.isLoading}>{busy ? 'Salvando…' : 'Salvar'}</button>}
      </div>
    </form>
  )
}

export function AcidenteModal({ acidenteId, empresaId, somenteLeitura, onClose }: {
  acidenteId?: string
  empresaId: string
  somenteLeitura: boolean
  onClose: () => void
}) {
  const detalhe = useAcidente(acidenteId)
  const catalogos = useCatalogosEsocial()
  const carregando = catalogos.isLoading || (!!acidenteId && detalhe.isLoading)
  const falha = catalogos.error ?? (acidenteId ? detalhe.error : null)
  return (
    <div className="modal-backdrop">
      {carregando || falha || !catalogos.data ? (
        <div className="modal"><div className="modal-body">
          {falha ? <p role="alert">{falha.message}</p> : <p><Loader2 size={16} /> Carregando…</p>}
          <button type="button" className="tbtn" onClick={onClose}>Fechar</button>
        </div></div>
      ) : (
        <FormAcidente
          acidente={acidenteId ? detalhe.data : undefined}
          empresaId={empresaId}
          catalogos={catalogos.data}
          somenteLeitura={somenteLeitura || !!detalhe.data?.anulado_em}
          onClose={onClose}
        />
      )}
    </div>
  )
}
