// Lightweight SVG chart kit — bar, line/area, donut, sparkline,
// horizontal bar list, funnel, progress ring. Hover tooltips included.
// Series colors come from the validated --chart-N palette.
import { useState, useRef, useMemo } from 'react';
import { CHART_COLORS } from './chartColors.js';



function useTooltip() {
  const [tip, setTip] = useState(null); // {x, y, title, rows: [{label, value, color}]}
  const show = (e, payload) => setTip({ x: e.clientX + 14, y: e.clientY + 12, ...payload });
  const hide = () => setTip(null);
  const node = tip ? (
    <div className="viz-tooltip" style={{ left: Math.min(tip.x, window.innerWidth - 190), top: Math.min(tip.y, window.innerHeight - 120) }}>
      {tip.title && <div className="tt-title">{tip.title}</div>}
      {tip.rows?.map((r, i) => (
        <div key={i} className="tt-row">
          <span>{r.color && <span className="tt-swatch" style={{ background: r.color }} />}{r.label}</span>
          <span className="tt-val">{r.value}</span>
        </div>
      ))}
    </div>
  ) : null;
  return { show, hide, node };
}

export function ChartLegend({ items }) {
  return (
    <div className="flex items-center gap-4 flex-wrap" style={{ fontSize: 11.5, color: 'var(--text-2)', fontWeight: 500 }}>
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          <span style={{ width: 9, height: 9, borderRadius: 3, background: it.color ?? CHART_COLORS[i], display: 'inline-block' }} />
          {it.label ?? it}
        </span>
      ))}
    </div>
  );
}

// ---------- Grouped / single-series vertical bars ----------
// data: [{label, ...seriesKeys}]; series: [{key, label, color?}]
export function BarChart({ data, series, height = 220, formatValue = (v) => v, showLegend = true, barRadius = 4 }) {
  const { show, hide, node } = useTooltip();
  const W = 600, H = height, padL = 34, padB = 24, padT = 10;
  const max = Math.max(...data.flatMap((d) => series.map((s) => d[s.key] ?? 0)), 1);
  const niceMax = max * 1.15;
  const groupW = (W - padL - 8) / data.length;
  const barW = Math.min(26, (groupW - 12) / series.length);
  const y = (v) => padT + (H - padB - padT) * (1 - v / niceMax);

  return (
    <div>
      {showLegend && series.length > 1 && <div className="mb-3"><ChartLegend items={series.map((s, i) => ({ label: s.label, color: s.color ?? CHART_COLORS[i] }))} /></div>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={padL} x2={W - 4} y1={y(niceMax * f)} y2={y(niceMax * f)} stroke="var(--chart-grid)" strokeWidth="1" />
            <text x={padL - 6} y={y(niceMax * f) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--text-3)">{formatValue(Math.round(niceMax * f))}</text>
          </g>
        ))}
        {data.map((d, di) => {
          const gx = padL + di * groupW + (groupW - barW * series.length - (series.length - 1) * 2) / 2;
          return (
            <g key={di}>
              {series.map((s, si) => {
                const v = d[s.key] ?? 0;
                const by = y(v);
                const bh = Math.max(0, H - padB - by);
                const color = s.color ?? CHART_COLORS[si];
                return (
                  <rect
                    key={s.key}
                    x={gx + si * (barW + 2)}
                    y={by}
                    width={barW}
                    height={bh}
                    rx={Math.min(barRadius, barW / 2)}
                    fill={color}
                    style={{ transformOrigin: `${gx}px ${H - padB}px`, animation: `nhr-barGrow 600ms var(--ease) both`, animationDelay: `${di * 40}ms`, cursor: 'pointer' }}
                    onMouseMove={(e) => show(e, { title: d.label, rows: series.map((s2, i2) => ({ label: s2.label, value: formatValue(d[s2.key] ?? 0), color: s2.color ?? CHART_COLORS[i2] })) })}
                    onMouseLeave={hide}
                  />
                );
              })}
              <text x={padL + di * groupW + groupW / 2} y={H - 7} textAnchor="middle" fontSize="10" fill="var(--text-3)">{d.label}</text>
            </g>
          );
        })}
        <line x1={padL} x2={W - 4} y1={H - padB} y2={H - padB} stroke="var(--chart-axis)" strokeWidth="1" />
      </svg>
      {node}
    </div>
  );
}

// ---------- Line / area chart ----------
export function LineChart({ data, series, height = 220, formatValue = (v) => v, showLegend = true, area = true }) {
  const { show, hide, node } = useTooltip();
  const [hoverI, setHoverI] = useState(null);
  const svgRef = useRef(null);
  const W = 600, H = height, padL = 36, padB = 22, padT = 10, padR = 10;
  const allVals = data.flatMap((d) => series.map((s) => d[s.key] ?? 0));
  const max = Math.max(...allVals, 1) * 1.1;
  const min = Math.min(...allVals, 0) * 0.95;
  const x = (i) => padL + (i * (W - padL - padR)) / Math.max(1, data.length - 1);
  const y = (v) => padT + (H - padB - padT) * (1 - (v - min) / (max - min || 1));

  const paths = useMemo(() => series.map((s) => {
    const pts = data.map((d, i) => `${x(i)},${y(d[s.key] ?? 0)}`);
    return { line: `M${pts.join(' L')}`, area: `M${pts.join(' L')} L${x(data.length - 1)},${H - padB} L${x(0)},${H - padB} Z` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, series, height]);

  const onMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - padL) / (W - padL - padR)) * (data.length - 1));
    const ci = Math.max(0, Math.min(data.length - 1, i));
    setHoverI(ci);
    show(e, { title: data[ci].label, rows: series.map((s, si) => ({ label: s.label, value: formatValue(data[ci][s.key] ?? 0), color: s.color ?? CHART_COLORS[si] })) });
  };

  return (
    <div>
      {showLegend && series.length > 1 && <div className="mb-3"><ChartLegend items={series.map((s, i) => ({ label: s.label, color: s.color ?? CHART_COLORS[i] }))} /></div>}
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} onMouseMove={onMove} onMouseLeave={() => { hide(); setHoverI(null); }}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={padL} x2={W - padR} y1={y(min + (max - min) * f)} y2={y(min + (max - min) * f)} stroke="var(--chart-grid)" strokeWidth="1" />
            <text x={padL - 6} y={y(min + (max - min) * f) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--text-3)">{formatValue(Math.round(min + (max - min) * f))}</text>
          </g>
        ))}
        {series.map((s, si) => {
          const color = s.color ?? CHART_COLORS[si];
          return (
            <g key={s.key}>
              {area && (
                <path d={paths[si].area} fill={color} opacity="0.09" />
              )}
              <path d={paths[si].line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ strokeDasharray: 900, '--dash': 900, animation: 'nhr-drawLine 1100ms var(--ease) both' }} />
            </g>
          );
        })}
        {hoverI != null && (
          <g>
            <line x1={x(hoverI)} x2={x(hoverI)} y1={padT} y2={H - padB} stroke="var(--chart-axis)" strokeWidth="1" strokeDasharray="3 3" />
            {series.map((s, si) => (
              <circle key={s.key} cx={x(hoverI)} cy={y(data[hoverI][s.key] ?? 0)} r="4" fill={s.color ?? CHART_COLORS[si]} stroke="var(--surface)" strokeWidth="2" />
            ))}
          </g>
        )}
        {/* The end labels sit on the plot edges, so a centred anchor pushes half
            the text outside the viewBox and it gets clipped ("Aug 20…"). Anchor
            the first to its start and the last to its end. */}
        {data.map((d, i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
            fontSize="10"
            fill="var(--text-3)"
          >
            {d.label}
          </text>
        ))}
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="var(--chart-axis)" strokeWidth="1" />
      </svg>
      {node}
    </div>
  );
}

// ---------- Donut ----------
export function DonutChart({ data, size = 168, thickness = 22, formatValue = (v) => v, centerLabel, centerValue }) {
  const { show, hide, node } = useTooltip();
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const R = size / 2, r = R - thickness;

  // Each arc starts where every arc before it ended. The source accumulated that in a
  // variable it reassigned inside map(), which mutates after render has begun; summing the
  // preceding slices instead reads the same and stays a pure expression.
  const startOf = (index) => data.slice(0, index).reduce((s, d) => s + (d.value / total) * 360, -90);

  const arcs = data.map((d, i) => {
    const sweep = (d.value / total) * 360;
    const a0 = startOf(i), a1 = a0 + sweep - 1.6; // 1.6° gap = surface spacer
    const rad = (a) => (a * Math.PI) / 180;
    const large = a1 - a0 > 180 ? 1 : 0;
    const mid = (R + r) / 2;
    const p = (a, rr) => `${R + rr * Math.cos(rad(a))},${R + rr * Math.sin(rad(a))}`;
    return {
      d: `M${p(a0, mid)} A${mid},${mid} 0 ${large} 1 ${p(a1, mid)}`,
      color: d.color ?? CHART_COLORS[i],
      item: d,
      pct: Math.round((d.value / total) * 100),
    };
  });
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, flexShrink: 0 }}>
        {arcs.map((a, i) => (
          <path key={i} d={a.d} fill="none" stroke={a.color} strokeWidth={thickness} strokeLinecap="round"
            style={{ animation: `nhr-fadeIn 500ms var(--ease) both`, animationDelay: `${i * 90}ms`, cursor: 'pointer' }}
            onMouseMove={(e) => show(e, { title: a.item.label, rows: [{ label: 'Value', value: formatValue(a.item.value), color: a.color }, { label: 'Share', value: `${a.pct}%` }] })}
            onMouseLeave={hide}
          />
        ))}
        <text x={R} y={R - 4} textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--text-1)">{centerValue ?? formatValue(total)}</text>
        <text x={R} y={R + 14} textAnchor="middle" fontSize="9.5" fill="var(--text-3)" fontWeight="600">{centerLabel ?? 'TOTAL'}</text>
      </svg>
      <div className="flex-col gap-2" style={{ minWidth: 130 }}>
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between gap-3 t-sm">
            <span className="flex items-center gap-2" style={{ color: 'var(--text-2)', fontWeight: 500 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color ?? CHART_COLORS[i] }} />
              {d.label}
            </span>
            <b className="tabular">{formatValue(d.value)}</b>
          </div>
        ))}
      </div>
      {node}
    </div>
  );
}

// ---------- Sparkline ----------
export function Sparkline({ values, color = 'var(--chart-1)', width = 110, height = 34, area = true }) {
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const x = (i) => (i * (width - 4)) / Math.max(1, values.length - 1) + 2;
  const y = (v) => 3 + (height - 8) * (1 - (v - min) / (max - min || 1));
  const pts = values.map((v, i) => `${x(i)},${y(v)}`);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width, height }}>
      {area && <path d={`M${pts.join(' L')} L${x(values.length - 1)},${height - 2} L${x(0)},${height - 2} Z`} fill={color} opacity="0.12" />}
      <path d={`M${pts.join(' L')}`} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.6" fill={color} stroke="var(--surface)" strokeWidth="1.4" />
    </svg>
  );
}

// ---------- Horizontal bar list (label + bar + value) ----------
export function HBarList({ data, formatValue = (v) => v, color, height = 9 }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex-col gap-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex items-center justify-between t-sm mb-1">
            <span className="fw-5 ink-2 truncate" style={{ maxWidth: '70%' }}>{d.label}</span>
            <b className="tabular ink-1">{formatValue(d.value)}</b>
          </div>
          <div className="progress-track" style={{ height }}>
            <div className="progress-fill" style={{ width: `${(d.value / max) * 100}%`, background: d.color ?? color ?? CHART_COLORS[i % 8], animation: 'nhr-fadeIn 700ms var(--ease) both' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Funnel ----------
// Expects stages already in pipeline order, each count being how many *reached* that
// stage (see api.getRecruitmentFunnel) — the widths are drawn against the first stage,
// so a series that is not monotonically decreasing is a data problem, not a chart one.
// `current` is optional: how many sit at the stage right now, shown as the subtitle.
export function FunnelChart({ data = [], formatValue = (v) => v }) {
  if (!data.length) return null;
  const valueOf = (d) => d?.count ?? d?.value ?? 0;
  const top = Math.max(valueOf(data[0]), 1);

  return (
    <div className="flex-col" style={{ gap: 3 }}>
      {data.map((d, i) => {
        const v = valueOf(d);
        const prev = i > 0 ? valueOf(data[i - 1]) : v;
        // clamped so a bad row cannot blow the bar past the container
        const width = Math.min(100, Math.max((v / top) * 100, 9));
        const conv = i > 0 && prev > 0 ? Math.round((v / prev) * 100) : null;
        const lost = i > 0 ? Math.max(prev - v, 0) : 0;
        // the fill walks from the accent through to the soft tint as the funnel narrows
        const shade = data.length > 1 ? i / (data.length - 1) : 0;
        const convTone =
          conv === null ? 'var(--text-3)'
            : conv >= 85 ? 'var(--success-ink)'
              : conv >= 60 ? 'var(--text-2)'
                : 'var(--danger-ink)';

        return (
          <div key={d.stage ?? d.label ?? i}>
            {/* drop-off between this stage and the one above it */}
            {lost > 0 && (
              <div className="flex items-center" style={{ gap: 12, height: 15 }}>
                <span style={{ width: 104, flexShrink: 0 }} />
                <span
                  className="t-xs tabular"
                  style={{ flex: 1, textAlign: 'center', color: 'var(--text-3)', fontSize: 10.5, letterSpacing: '0.02em' }}
                >
                  −{formatValue(lost)}
                </span>
                <span style={{ width: 52, flexShrink: 0 }} />
              </div>
            )}

            <div className="flex items-center" style={{ gap: 12 }}>
              <span className="t-sm ink-2 fw-6" style={{ width: 104, flexShrink: 0, lineHeight: 1.25 }}>
                {d.stage ?? d.label}
              </span>

              <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
                <div
                  title={d.current != null ? `${formatValue(v)} reached · ${formatValue(d.current)} here now` : undefined}
                  style={{
                    width: `${width}%`,
                    minWidth: 62,
                    height: 30,
                    borderRadius: 8,
                    background: `linear-gradient(135deg,
                      color-mix(in srgb, var(--chart-1) ${92 - shade * 62}%, var(--tint-blue)),
                      color-mix(in srgb, var(--chart-1) ${74 - shade * 58}%, var(--tint-blue)))`,
                    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.10)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    color: shade < 0.55 ? '#fff' : 'var(--text-1)',
                    fontSize: 12,
                    fontWeight: 700,
                    animation: 'nhr-scaleIn 500ms var(--ease) both',
                    animationDelay: `${i * 60}ms`,
                  }}
                >
                  <span className="tabular">{formatValue(v)}</span>
                  {d.current != null && d.current > 0 && width > 26 && (
                    <span className="tabular" style={{ fontSize: 10, fontWeight: 600, opacity: 0.72 }}>
                      · {formatValue(d.current)} here
                    </span>
                  )}
                </div>
              </div>

              <span
                className="t-xs tabular fw-6"
                style={{ width: 52, textAlign: 'right', flexShrink: 0, color: convTone }}
              >
                {conv === null ? '' : `${conv}%`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Progress ring ----------
export function ProgressRing({ value, size = 64, thickness = 7, color = 'var(--chart-1)', label }) {
  const R = (size - thickness) / 2;
  const C = 2 * Math.PI * R;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
      <circle
        cx={size / 2} cy={size / 2} r={R} fill="none" stroke={color} strokeWidth={thickness}
        strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(100, value) / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 900ms var(--ease)' }}
      />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fontSize={size / 4.6} fontWeight="800" fill="var(--text-1)">{label ?? `${value}%`}</text>
    </svg>
  );
}
