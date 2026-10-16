import { useId, useMemo, useState } from 'react'
import type { CodigoEsocial } from '@/lib/esocial'

/** Select de código eSocial com busca por texto ou código (a Tabela 14 tem 248 itens). */
export function CodigoEsocialSelect({ label, codigos, value, onChange, disabled }: {
  label: string
  codigos: CodigoEsocial[]
  value: string
  onChange: (codigo: string) => void
  disabled?: boolean
}) {
  const id = useId()
  const [busca, setBusca] = useState('')
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return codigos
    return codigos.filter(c => c.codigo.includes(termo) || c.descricao.toLowerCase().includes(termo) || c.codigo === value)
  }, [busca, codigos, value])
  const selecionado = codigos.find(c => c.codigo === value)
  return (
    <div className="mp-field">
      <label htmlFor={id}>{label}</label>
      {codigos.length > 30 && (
        <input className="mp-input" aria-label={`Buscar ${label}`} placeholder="Buscar por descrição ou código"
          value={busca} onChange={e => setBusca(e.target.value)} disabled={disabled} />
      )}
      <select id={id} className="mp-input" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
        <option value="">Não informado</option>
        {filtrados.map(c => <option key={c.codigo} value={c.codigo}>{c.descricao} ({c.codigo})</option>)}
      </select>
      {selecionado?.conceito && <small className="ac-hint">{selecionado.conceito}</small>}
    </div>
  )
}
