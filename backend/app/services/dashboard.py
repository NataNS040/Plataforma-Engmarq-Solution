from uuid import UUID
from app.core.entitlements import require_feature
from app.core.errors import AppError
from app.schemas.dashboard import DashboardAlerta, DashboardKpis


class DashboardService:
    def __init__(self, repository, actor):
        self.repository = repository
        self.actor = actor

    def scope(self, requested):
        if self.actor.role == 'admin':
            if requested not in (None, 'all'):
                raise AppError(403, 'access_denied', 'Admin não acessa indicadores operacionais.')
            return None
        if self.actor.role not in {'empresa', 'gestor', 'operacional'} or requested == 'all':
            raise AppError(403, 'access_denied', 'Sem acesso a este dashboard.')
        if requested is not None and UUID(str(requested)) != self.actor.empresa_id:
            raise AppError(403, 'access_denied', 'Sem acesso a esta empresa.')
        for feature in ('relatorios.sst', 'documentos', 'exames', 'treinamentos'):
            require_feature(self.repository.client, self.actor, feature)
        return self.actor.empresa_id

    def kpis(self, requested=None):
        company = self.scope(requested)
        if company is None:
            # No queries to operational tables, even for aggregate counts.
            return DashboardKpis(totalColaboradores=None, totalEmpresas=self.repository.count('empresas'),
                                 totalDocumentos=0, totalTreinamentos=None, docsVencidos=0, docsVencendo=0,
                                 treinamentosVencidos=None, treinamentosVencendo=None, compliancePct=0,
                                 operacionalDisponivel=False)
        counts = {}
        for table, good in [('documentos', 'vigente'), ('treinamentos', 'em_dia')]:
            counts[table] = {status: self.repository.count(table, company, status)
                             for status in ['vencido', 'vencendo', good]}
            counts[table]['total'] = self.repository.count(table, company)
        docs, trains = counts['documentos'], counts['treinamentos']
        total = docs['total'] + trains['total']
        compliance = round(100 * (docs['vigente'] + trains['em_dia']) / total) if total else 100
        return DashboardKpis(totalColaboradores=self.repository.count('colaboradores', company, active=True),
                             totalEmpresas=1, totalDocumentos=docs['total'], totalTreinamentos=trains['total'],
                             docsVencidos=docs['vencido'], docsVencendo=docs['vencendo'],
                             treinamentosVencidos=trains['vencido'], treinamentosVencendo=trains['vencendo'],
                             compliancePct=compliance, operacionalDisponivel=True)

    def alerts(self, requested=None, limit=5):
        company = self.scope(requested)
        if company is None:
            return []
        docs = self.repository.alerts('vw_dashboard_documentos',
                                     'empresa_id,titulo,status_calculado,dias_restantes,vencimento', company, limit)
        trains = self.repository.alerts('vw_dashboard_treinamentos',
                                       'empresa_id,colaborador_nome,treinamento_nome,status_calculado,dias_restantes,data_vencimento',
                                       company, limit)
        rows = [DashboardAlerta(tipo='documento', empresa_id=d['empresa_id'], titulo=d['titulo'],
                               nome_envolvido=None, status=d['status_calculado'], dias_restantes=d['dias_restantes'],
                               vencimento=d['vencimento']) for d in docs]
        rows += [DashboardAlerta(tipo='treinamento', empresa_id=t['empresa_id'], titulo=t['treinamento_nome'],
                                nome_envolvido=t['colaborador_nome'], status=t['status_calculado'],
                                dias_restantes=t['dias_restantes'], vencimento=t['data_vencimento']) for t in trains]
        return sorted(rows, key=lambda r: (r.dias_restantes is None, r.dias_restantes or 0, r.tipo, r.titulo))[:limit]
