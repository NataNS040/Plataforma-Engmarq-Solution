import type { TooltipContentProps } from "recharts"
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent"

/**
 * Peças reaproveitáveis de estilo para os gráficos Recharts do app (Dashboard,
 * Exames, Documentos, Treinamentos) — parte do refresh visual que troca o
 * tooltip padrão "cru" por um card flutuante sólido e dá às áreas/linhas um
 * preenchimento em gradiente suave, no lugar de cor chapada.
 *
 * Cores continuam vindo de `src/lib/theme.ts` (CHART_PALETTE/getChartColor) —
 * este arquivo só estiliza a apresentação, não decide paleta.
 */

/** Tooltip flutuante padrão — card branco sólido com sombra (sem glass/blur).
 *  Uso: <Tooltip content={<ChartTooltip />} /> */
export function ChartTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-md)",
        padding: "10px 12px",
        fontSize: 12.5,
        minWidth: 130,
      }}
    >
      {label !== undefined && label !== "" && (
        <div style={{ fontWeight: 600, color: "var(--ink-900)", marginBottom: 6 }}>
          {label}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {payload.map((p, i: number) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-700)" }}>
            <span
              style={{
                width: 8, height: 8, borderRadius: 999,
                background: (p.color as string) ?? "var(--blue-500)",
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1 }}>{p.name}</span>
            <span style={{ fontWeight: 700, color: "var(--ink-900)" }}>{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Id previsível de gradiente por série — evita colisão quando há mais de um
 *  gráfico com área na mesma tela. */
export function chartGradientId(seed: string) {
  return `chart-grad-${seed}`
}

/** <linearGradient> de preenchimento pra <Area>: cor cheia no topo, transparente
 *  na base. Declarar dentro de <defs> e usar fill={`url(#${id})`} na <Area>. */
export function ChartAreaGradient({ id, color }: { id: string; color: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor={color} stopOpacity={0.32} />
      <stop offset="95%" stopColor={color} stopOpacity={0} />
    </linearGradient>
  )
}
