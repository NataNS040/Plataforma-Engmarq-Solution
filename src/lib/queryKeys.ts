export const qk = {
  auth: {
    profile: (userId: string | undefined) => ['auth', 'profile', userId] as const,
  },
  empresas: {
    all: ['empresas'] as const,
    list: () => [...qk.empresas.all, 'list'] as const,
    detail: (id: string) => [...qk.empresas.all, 'detail', id] as const,
  },
  setores: {
    all: ['setores'] as const,
    list: (empresaId: string) => [...qk.setores.all, 'list', empresaId] as const,
  },
  funcoes: {
    all: ['funcoes'] as const,
    list: (empresaId: string) => [...qk.funcoes.all, 'list', empresaId] as const,
  },
  ambientes: {
    all: ['ambientes'] as const,
    list: (empresaId: string) => [...qk.ambientes.all, 'list', empresaId] as const,
  },
  colaboradores: {
    all: ['colaboradores'] as const,
    list: (empresaId: string) => [...qk.colaboradores.all, 'list', empresaId] as const,
    detail: (id: string) => [...qk.colaboradores.all, 'detail', id] as const,
  },
  documentoTipos: {
    all: ['documento_tipos'] as const,
    list: () => [...qk.documentoTipos.all, 'list'] as const,
  },
  documentos: {
    all: ['documentos'] as const,
    list: (empresaId: string) => [...qk.documentos.all, 'list', empresaId] as const,
    detail: (id: string) => [...qk.documentos.all, 'detail', id] as const,
  },
  treinamentoTipos: {
    all: ['treinamento_tipos'] as const,
    list: () => [...qk.treinamentoTipos.all, 'list'] as const,
  },
  matrizTreinamentos: {
    all: ['matriz_treinamentos'] as const,
    list: (empresaId: string) => [...qk.matrizTreinamentos.all, 'list', empresaId] as const,
    byFuncao: (empresaId: string, funcaoId: string) =>
      [...qk.matrizTreinamentos.all, 'funcao', empresaId, funcaoId] as const,
  },
  treinamentos: {
    all: ['treinamentos'] as const,
    list: (empresaId: string) => [...qk.treinamentos.all, 'list', empresaId] as const,
    byColaborador: (colaboradorId: string) =>
      [...qk.treinamentos.all, 'colaborador', colaboradorId] as const,
  },
  exames: {
    all: ['exames'] as const,
    list: (empresaId: string) => [...qk.exames.all, 'list', empresaId] as const,
    byColaborador: (colaboradorId: string) =>
      [...qk.exames.all, 'colaborador', colaboradorId] as const,
  },
  examesCatalogo: {
    all: ['exames_catalogo'] as const,
    list: () => [...qk.examesCatalogo.all, 'list'] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    kpis: (empresaId: string | 'all') => [...qk.dashboard.all, 'kpis', empresaId] as const,
    alertas: (empresaId: string | 'all', limit: number) =>
      [...qk.dashboard.all, 'alertas', empresaId, limit] as const,
    documentosView: (empresaId: string | 'all') =>
      [...qk.dashboard.all, 'documentos-view', empresaId] as const,
    treinamentosView: (empresaId: string | 'all') =>
      [...qk.dashboard.all, 'treinamentos-view', empresaId] as const,
  },
} as const
