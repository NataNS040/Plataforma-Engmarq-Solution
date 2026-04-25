export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Colaboradores Ativos', value: '—', color: 'bg-blue-50 text-blue-700' },
          { label: 'Documentos Vigentes', value: '—', color: 'bg-green-50 text-green-700' },
          { label: 'Documentos Vencendo', value: '—', color: 'bg-yellow-50 text-yellow-700' },
          { label: 'Documentos Vencidos', value: '—', color: 'bg-red-50 text-red-700' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">{kpi.label}</p>
            <p className={`text-3xl font-black ${kpi.color.split(' ')[1]}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-700 mb-2">Dashboard em construção</h2>
        <p className="text-sm text-gray-500">Os indicadores serão carregados após configurar o Supabase e adicionar dados.</p>
      </div>
    </div>
  )
}
