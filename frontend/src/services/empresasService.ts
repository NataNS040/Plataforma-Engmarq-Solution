// Compatibility facade: keep existing hooks, imports and query invalidations.
export {
  listarEmpresas,
  obterEmpresa,
  criarEmpresa,
  atualizarEmpresa,
  desativarEmpresa,
  type EmpresaStatus,
  type EmpresaComContagem,
  type EmpresaInput,
} from './api/empresas'
