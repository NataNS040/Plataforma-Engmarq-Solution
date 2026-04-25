export type UserRole = 'admin' | 'gestor' | 'operacional'
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
export interface Database {
  public: {
    Tables: {
      user_profiles: { Row: UserProfile; Insert: Omit<UserProfile, 'created_at'>; Update: Partial<UserProfile> }
      empresas: { Row: Empresa; Insert: Omit<Empresa, 'created_at'>; Update: Partial<Empresa> }
      setores: { Row: Setor; Insert: Omit<Setor, 'id'>; Update: Partial<Setor> }
      funcoes: { Row: Funcao; Insert: Omit<Funcao, 'id'>; Update: Partial<Funcao> }
      ambientes: { Row: Ambiente; Insert: Omit<Ambiente, 'id'>; Update: Partial<Ambiente> }
      colaboradores: { Row: Colaborador; Insert: Omit<Colaborador, 'id' | 'created_at'>; Update: Partial<Colaborador> }
      documento_tipos: { Row: DocumentoTipo; Insert: Omit<DocumentoTipo, 'id'>; Update: Partial<DocumentoTipo> }
      documentos: { Row: Documento; Insert: Omit<Documento, 'id' | 'created_at'>; Update: Partial<Documento> }
      treinamento_tipos: { Row: TreinamentoTipo; Insert: Omit<TreinamentoTipo, 'id'>; Update: Partial<TreinamentoTipo> }
      matriz_treinamentos: { Row: MatrizTreinamento; Insert: Omit<MatrizTreinamento, 'id'>; Update: Partial<MatrizTreinamento> }
      treinamentos: { Row: Treinamento; Insert: Omit<Treinamento, 'id' | 'created_at'>; Update: Partial<Treinamento> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: UserRole
      doc_status: DocStatus
      treinamento_status: TreinamentoStatus
    }
  }
}
