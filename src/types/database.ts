export type UserRole = 'admin' | 'gestor' | 'operacional' | 'empresa'
export type DocStatus = 'vigente' | 'vencendo' | 'vencido'
export type TreinamentoStatus = 'em_dia' | 'vencendo' | 'vencido' | 'pendente'

export interface UserProfile {
  id: string
  email: string
  full_name: string
  role: UserRole
  empresa_id: string
  active: boolean
  created_at: string
}

export interface Empresa {
  id: string
  razao_social: string
  cnpj: string
  logo_url: string | null
  setor: string | null
  cidade: string | null
  uf: string | null
  responsavel: string | null
  email: string | null
  telefone: string | null
  status: 'ativa' | 'pendente' | 'suspensa'
  created_at: string
}

export interface Setor {
  id: string
  empresa_id: string
  nome: string
  descricao: string | null
  active: boolean
}

export interface Funcao {
  id: string
  empresa_id: string
  nome: string
  descricao: string | null
  riscos: string | null
  active: boolean
}

export interface Ambiente {
  id: string
  empresa_id: string
  nome: string
  descricao: string | null
  active: boolean
}

export interface Colaborador {
  id: string
  empresa_id: string
  nome: string
  cpf: string
  matricula: string | null
  funcao_id: string
  setor_id: string
  ambiente_id: string | null
  data_admissao: string
  data_demissao: string | null
  active: boolean
  created_at: string
  funcao?: Funcao
  setor?: Setor
  ambiente?: Ambiente
}

export interface DocumentoTipo {
  id: string
  nome: string
  descricao: string | null
  validade_meses: number | null
}

export type SubtipoExame = 'admissional' | 'periodico' | 'mudanca_risco' | 'retorno_trabalho' | 'demissional'

export interface ExameCatalogo {
  id: number
  nome: string
  ordem: number
}

export interface Documento {
  id: string
  empresa_id: string
  tipo_id: string
  titulo: string
  numero: string | null
  emissao: string | null
  vencimento: string | null
  arquivo_url: string | null
  status: DocStatus
  observacoes: string | null
  colaborador_id: string | null
  subtipo_exame: SubtipoExame | null
  exames_realizados: string[] | null
  created_at: string
  tipo?: DocumentoTipo
}

export interface TreinamentoTipo {
  id: string
  nome: string
  descricao: string | null
  nr_referencia: string | null
  validade_meses: number | null
}

export interface MatrizTreinamento {
  id: string
  empresa_id: string
  funcao_id: string
  treinamento_tipo_id: string
  obrigatorio: boolean
  funcao?: Funcao
  treinamento_tipo?: TreinamentoTipo
}

export interface Treinamento {
  id: string
  empresa_id: string
  colaborador_id: string
  treinamento_tipo_id: string
  data_realizacao: string
  data_vencimento: string | null
  carga_horaria: number | null
  instrutor: string | null
  certificado_url: string | null
  status: TreinamentoStatus
  created_at: string
  colaborador?: Colaborador
  treinamento_tipo?: TreinamentoTipo
}

// Supabase Database type stub (to be expanded as tables are created)
// supabase-js exige que Row satisfaça Record<string,unknown> e Relationships
// seja um array do formato correto. Usamos interseção para manter a interface
// tipada sem precisar de index-signature em cada entidade.
type GenericRel = {
  foreignKeyName: string
  columns: string[]
  isOneToOne?: boolean
  referencedRelation: string
  referencedColumns: string[]
}

type TableDef<T> = {
  Row: T & Record<string, unknown>
  Insert: Partial<T> & Record<string, unknown>
  Update: Partial<T> & Record<string, unknown>
  Relationships: GenericRel[]
}

export interface Database {
  public: {
    Tables: {
      user_profiles:       TableDef<UserProfile>
      empresas:            TableDef<Empresa>
      setores:             TableDef<Setor>
      funcoes:             TableDef<Funcao>
      ambientes:           TableDef<Ambiente>
      colaboradores:       TableDef<Colaborador>
      documento_tipos:     TableDef<DocumentoTipo>
      documentos:          TableDef<Documento>
      treinamento_tipos:   TableDef<TreinamentoTipo>
      matriz_treinamentos: TableDef<MatrizTreinamento>
      treinamentos:        TableDef<Treinamento>
    }
    Views: {
      vw_dashboard_documentos: {
        Row: {
          empresa_id: string
          tipo_nome: string
          titulo: string
          vencimento: string | null
          status_calculado: DocStatus
          dias_restantes: number | null
        } & Record<string, unknown>
        Relationships: GenericRel[]
      }
      vw_dashboard_treinamentos: {
        Row: {
          empresa_id: string
          colaborador_id: string
          colaborador_nome: string
          treinamento_nome: string
          data_vencimento: string | null
          status_calculado: TreinamentoStatus
          dias_restantes: number | null
        } & Record<string, unknown>
        Relationships: GenericRel[]
      }
    }
    Functions: Record<string, never>
    Enums: {
      user_role: UserRole
      doc_status: DocStatus
      treinamento_status: TreinamentoStatus
    }
  }
}
