import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Briefcase, MapPin, Layers, Plus, Trash2, Loader2, AlertTriangle,
} from 'lucide-react'
import {
  useSetores, useCriarSetor, useDesativarSetor,
  useFuncoes, useCriarFuncao, useDesativarFuncao,
  useAmbientes, useCriarAmbiente, useDesativarAmbiente,
} from '@/hooks/queries/useCatalogos'

type CatKind = 'setores' | 'funcoes' | 'ambientes'

const KINDS: { id: CatKind; label: string; icon: React.ElementType }[] = [
  { id: 'setores',   label: 'Setores',   icon: Briefcase },
  { id: 'funcoes',   label: 'Funções',   icon: Layers },
  { id: 'ambientes', label: 'Ambientes', icon: MapPin },
]

const schema = z.object({
  nome: z.string().min(2, 'Informe um nome (mín. 2 caracteres)'),
  descricao: z.string(),
})
type FormValues = z.infer<typeof schema>

export function CatalogosTab({ empresaId }: { empresaId: string | null }) {
  const [kind, setKind] = useState<CatKind>('setores')

  if (!empresaId) {
    return (
      <div className="card mp-card">
        <div style={{ padding: 20, color: 'var(--ink-500)', fontSize: 13 }}>
          Nenhuma empresa vinculada ao seu perfil.
        </div>
      </div>
    )
  }

  return (
    <div className="card mp-card">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:12 }}>
        <div>
          <h3 style={{ margin:0 }}>Catálogos da empresa</h3>
          <div style={{ fontSize:12.5, color:'var(--ink-500)', marginTop:2 }}>
            Setores, funções e ambientes utilizados no cadastro de colaboradores.
          </div>
        </div>
        <div className="mp-tabs" style={{ margin:0 }}>
          {KINDS.map(k => (
            <button
              key={k.id}
              className={`mp-tab${kind === k.id ? ' on' : ''}`}
              onClick={() => setKind(k.id)}
            >
              <k.icon size={14} /><span>{k.label}</span>
            </button>
          ))}
        </div>
      </div>

      {kind === 'setores'   && <SetoresPanel empresaId={empresaId} />}
      {kind === 'funcoes'   && <FuncoesPanel empresaId={empresaId} />}
      {kind === 'ambientes' && <AmbientesPanel empresaId={empresaId} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Setores
// ---------------------------------------------------------------------------
function SetoresPanel({ empresaId }: { empresaId: string }) {
  const query = useSetores(empresaId)
  const criar = useCriarSetor()
  const desativar = useDesativarSetor()

  const items = useMemo(
    () => (query.data ?? []).filter(x => x.active !== false),
    [query.data]
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nome: '', descricao: '' },
  })

  async function onSubmit(v: FormValues) {
    try {
      await criar.mutateAsync({ empresa_id: empresaId, nome: v.nome, descricao: v.descricao || null })
      form.reset()
    } catch { /* toast */ }
  }

  return (
    <CatalogoLayout
      query={query}
      items={items.map(s => ({ id: s.id, nome: s.nome, descricao: s.descricao }))}
      onDesativar={id => desativar.mutate(id)}
      form={form}
      onSubmit={onSubmit}
      submitting={criar.isPending}
      placeholder="Ex.: Produção, Manutenção, Administrativo…"
    />
  )
}

// ---------------------------------------------------------------------------
// Funções
// ---------------------------------------------------------------------------
function FuncoesPanel({ empresaId }: { empresaId: string }) {
  const query = useFuncoes(empresaId)
  const criar = useCriarFuncao()
  const desativar = useDesativarFuncao()

  const items = useMemo(
    () => (query.data ?? []).filter(x => x.active !== false),
    [query.data]
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nome: '', descricao: '' },
  })

  async function onSubmit(v: FormValues) {
    try {
      await criar.mutateAsync({ empresa_id: empresaId, nome: v.nome, descricao: v.descricao || null })
      form.reset()
    } catch { /* toast */ }
  }

  return (
    <CatalogoLayout
      query={query}
      items={items.map(f => ({ id: f.id, nome: f.nome, descricao: f.descricao }))}
      onDesativar={id => desativar.mutate(id)}
      form={form}
      onSubmit={onSubmit}
      submitting={criar.isPending}
      placeholder="Ex.: Soldador, Eletricista, Motorista…"
    />
  )
}

// ---------------------------------------------------------------------------
// Ambientes
// ---------------------------------------------------------------------------
function AmbientesPanel({ empresaId }: { empresaId: string }) {
  const query = useAmbientes(empresaId)
  const criar = useCriarAmbiente()
  const desativar = useDesativarAmbiente()

  const items = useMemo(
    () => (query.data ?? []).filter(x => x.active !== false),
    [query.data]
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nome: '', descricao: '' },
  })

  async function onSubmit(v: FormValues) {
    try {
      await criar.mutateAsync({ empresa_id: empresaId, nome: v.nome, descricao: v.descricao || null })
      form.reset()
    } catch { /* toast */ }
  }

  return (
    <CatalogoLayout
      query={query}
      items={items.map(a => ({ id: a.id, nome: a.nome, descricao: a.descricao }))}
      onDesativar={id => desativar.mutate(id)}
      form={form}
      onSubmit={onSubmit}
      submitting={criar.isPending}
      placeholder="Ex.: Galpão A, Escritório central, Obra 01…"
    />
  )
}

// ---------------------------------------------------------------------------
// Layout compartilhado
// ---------------------------------------------------------------------------
interface CatalogoLayoutProps {
  query: { isLoading: boolean; isError: boolean; refetch: () => void }
  items: { id: string; nome: string; descricao: string | null }[]
  onDesativar: (id: string) => void
  form: ReturnType<typeof useForm<FormValues>>
  onSubmit: (v: FormValues) => Promise<void>
  submitting: boolean
  placeholder: string
}

function CatalogoLayout({ query, items, onDesativar, form, onSubmit, submitting, placeholder }: CatalogoLayoutProps) {
  const { register, handleSubmit, formState: { errors } } = form

  return (
    <div>
      <form
        onSubmit={handleSubmit(onSubmit)}
        style={{ display:'grid', gridTemplateColumns:'2fr 3fr auto', gap:10, marginBottom:16 }}
        noValidate
      >
        <div>
          <input className="mp-input" placeholder={placeholder} {...register('nome')} />
          {errors.nome && (
            <div style={{ color:'var(--red-600, #dc2626)', fontSize:11.5, marginTop:4 }}>
              {errors.nome.message}
            </div>
          )}
        </div>
        <input className="mp-input" placeholder="Descrição (opcional)" {...register('descricao')} />
        <button type="submit" className="tbtn accent" disabled={submitting}>
          {submitting ? <Loader2 size={13} className="btn-spinner" /> : <Plus size={13} />}
          Adicionar
        </button>
      </form>

      {query.isLoading ? (
        <div style={{ padding:24, textAlign:'center', color:'var(--ink-400)', fontSize:13 }}>
          <Loader2 size={16} className="btn-spinner" style={{ display:'inline-block', marginRight:6 }} />
          Carregando…
        </div>
      ) : query.isError ? (
        <div style={{ padding:24, textAlign:'center', color:'var(--red-500)', fontSize:13 }}>
          <AlertTriangle size={16} style={{ display:'inline-block', marginRight:6 }} />
          Erro ao carregar.{' '}
          <button className="tbtn ghost" onClick={() => query.refetch()}>Tentar novamente</button>
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding:24, textAlign:'center', color:'var(--ink-400)', fontSize:13 }}>
          Nenhum item cadastrado ainda.
        </div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descrição</th>
              <th style={{ width:60, textAlign:'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id}>
                <td style={{ fontWeight:600 }}>{it.nome}</td>
                <td style={{ color:'var(--ink-500)', fontSize:12.5 }}>{it.descricao || '—'}</td>
                <td style={{ textAlign:'right' }}>
                  <button
                    className="icon-btn sm danger"
                    title="Desativar"
                    onClick={() => {
                      if (window.confirm(`Desativar "${it.nome}"?`)) onDesativar(it.id)
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
