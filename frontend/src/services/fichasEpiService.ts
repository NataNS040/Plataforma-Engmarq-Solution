import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import type { FichaEpi, FichaEpiItem } from '@/types/database'

// ---------------------------------------------------------------------------
// Fichas de EPI — cabeçalho (evento de entrega/assinatura) + itens
// (equipamento entregue). Substitui o hack da Etapa 4, que gravava cada
// item de EPI como uma linha solta na tabela genérica `documentos`, sem
// vínculo entre itens entregues juntos e sem como assinar a entrega como
// um todo.
// ---------------------------------------------------------------------------

export interface FichaEpiComItens extends FichaEpi {
  itens: FichaEpiItem[]
}

const FICHA_EPI_SELECT = `
  *,
  colaborador:colaboradores(id, nome),
  itens:fichas_epi_itens(*)
`

export async function listarFichasEpi(empresaId: string): Promise<FichaEpiComItens[]> {
  const { data, error } = await supabase
    .from('fichas_epi')
    .select(FICHA_EPI_SELECT)
    .eq('empresa_id', empresaId)
    .order('data_entrega', { ascending: false })
  if (error) throw handleSupabaseError(error, 'Não foi possível carregar as fichas de EPI.')
  return (data ?? []) as unknown as FichaEpiComItens[]
}

export async function listarFichasEpiDoColaborador(colaboradorId: string): Promise<FichaEpiComItens[]> {
  const { data, error } = await supabase
    .from('fichas_epi')
    .select(FICHA_EPI_SELECT)
    .eq('colaborador_id', colaboradorId)
    .order('data_entrega', { ascending: false })
  if (error) throw handleSupabaseError(error, 'Não foi possível carregar as fichas de EPI do colaborador.')
  return (data ?? []) as unknown as FichaEpiComItens[]
}

export interface FichaEpiItemInput {
  equipamento: string
  ca?: string | null
  data_validade?: string | null
}

export interface FichaEpiInput {
  empresa_id: string
  colaborador_id: string
  data_entrega: string
  observacoes?: string | null
  itens: FichaEpiItemInput[]
}

export async function criarFichaEpi(input: FichaEpiInput): Promise<FichaEpiComItens> {
  const { data: ficha, error: fichaError } = await supabase
    .from('fichas_epi')
    .insert({
      empresa_id:     input.empresa_id,
      colaborador_id: input.colaborador_id,
      data_entrega:   input.data_entrega,
      observacoes:    input.observacoes ?? null,
    })
    .select('*')
    .single()
  if (fichaError) throw handleSupabaseError(fichaError, 'Não foi possível criar a ficha de EPI.')

  const itensPayload = input.itens.map(it => ({
    ficha_epi_id:  ficha.id,
    empresa_id:    input.empresa_id,
    equipamento:   it.equipamento,
    ca:            it.ca ?? null,
    data_validade: it.data_validade ?? null,
  }))
  const { data: itens, error: itensError } = await supabase
    .from('fichas_epi_itens')
    .insert(itensPayload)
    .select('*')
  if (itensError) {
    // Ficha sem nenhum item não faz sentido — desfaz o cabeçalho pra não
    // deixar uma ficha "fantasma" no banco.
    await supabase.from('fichas_epi').delete().eq('id', ficha.id)
    throw handleSupabaseError(itensError, 'Não foi possível salvar os itens da ficha de EPI.')
  }

  return { ...(ficha as FichaEpi), itens: (itens ?? []) as FichaEpiItem[] }
}

export async function deletarFichaEpi(id: string): Promise<void> {
  // Só apaga se ainda não foi assinada — ficha assinada é registro de
  // auditoria, não deve sumir por engano.
  const { error, count } = await supabase
    .from('fichas_epi')
    .delete({ count: 'exact' })
    .eq('id', id)
    .is('assinado_em', null)
  if (error) throw handleSupabaseError(error, 'Não foi possível remover a ficha de EPI.')
  if (count === 0) throw new Error('Fichas já assinadas não podem ser excluídas.')
}

// Bucket 'assinaturas' — ver migration 012_storage_assinaturas.sql
export async function uploadAssinaturaFoto(empresaId: string, blob: Blob): Promise<string> {
  const path = `${empresaId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from('assinaturas')
    .upload(path, blob, { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' })
  if (error) throw handleSupabaseError(error, 'Não foi possível salvar a foto da assinatura.')
  const { data } = supabase.storage.from('assinaturas').getPublicUrl(path)
  return data.publicUrl
}

export async function assinarFichaEpi(id: string, fotoUrl: string, assinadoPor: string): Promise<FichaEpi> {
  const { data, error } = await supabase
    .from('fichas_epi')
    .update({
      foto_assinatura_url: fotoUrl,
      assinado_em: new Date().toISOString(),
      assinado_por: assinadoPor,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw handleSupabaseError(error, 'Não foi possível registrar a assinatura da ficha.')
  return data as FichaEpi
}
