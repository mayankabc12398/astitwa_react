/**
 * The categorical series palette, in its own module so charts.jsx exports components only —
 * a file that mixes the two loses fast refresh for every component in it.
 *
 * The values are theme variables rather than literals, so a chart follows the tokens in
 * nhr-theme.css instead of carrying a second copy of the palette.
 */
export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
]
