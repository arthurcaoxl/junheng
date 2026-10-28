import type { DayRecord } from "./SevenDayCheckIn";
import { formatTrendValue, selectTrendLabelDays } from "../utils/trend";

type TrendChartProps = {
  records: DayRecord[];
  metric: "weight" | "waist";
};

const chartConfig = {
  weight: { title: "体重趋势", unit: "kg", label: "体重趋势图" },
  waist: { title: "腰围趋势", unit: "cm", label: "腰围趋势图" },
} as const;

function TrendChart({ records, metric }: TrendChartProps) {
  const config = chartConfig[metric];
  const points = records.map((day, index) => ({ day: index + 1, value: Number(day[metric]) }))
    .filter((point) => Number.isFinite(point.value) && point.value > 0);
  const values = points.map((point) => point.value);
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 1;
  const spread = Math.max(maximum - minimum, 1);
  const x = (day: number) => 50 + ((day - 1) / Math.max(records.length - 1, 1)) * 900;
  const y = (value: number) => 210 - ((value - minimum) / spread) * 140;
  const segments: { x: number; y: number }[][] = [];
  points.forEach((point, index) => {
    if (index === 0 || point.day !== points[index - 1].day + 1) segments.push([]);
    segments[segments.length - 1].push({ x: x(point.day), y: y(point.value) });
  });
  const latest = points[points.length - 1];
  const labelDays = selectTrendLabelDays(points);
  const axisDays = [1, 5, 10, 15, 21];

  return (
    <article className="trend-card">
      <header><div><span>PERSONAL TREND</span><h3>{config.title}</h3></div><strong>{points.length}<span> / 21 天已记录</span></strong></header>
      {points.length ? (
        <>
          <div className="trend-chart-scroll" tabIndex={0} aria-label={`${config.title}，窄屏可横向滑动查看`}>
            <svg className="trend-chart" viewBox="0 0 1000 290" role="img" aria-label={config.label}>
              <title>{config.label}：仅展示本人实际记录，空缺日期不补值</title>
              {[70, 140, 210].map((lineY) => <line key={lineY} x1="38" x2="962" y1={lineY} y2={lineY} className="trend-grid-line" />)}
              {segments.map((segment, index) => segment.length > 1 && (
                <polyline key={index} points={segment.map((point) => `${point.x},${point.y}`).join(" ")} className="trend-line" />
              ))}
              {points.map((point) => (
                <g key={point.day}>
                  <circle cx={x(point.day)} cy={y(point.value)} r="6" className="trend-point" />
                  {labelDays.has(point.day) && <text x={x(point.day)} y={Math.max(y(point.value) - 18, 28)} textAnchor="middle" className="trend-value">{formatTrendValue(point.value)} {config.unit}</text>}
                </g>
              ))}
              {axisDays.map((day) => <text key={day} x={x(day)} y="260" textAnchor="middle" className="trend-day">D{day}</text>)}
            </svg>
          </div>
          <small className="trend-swipe-hint">左右滑动查看完整 21 天记录 →</small>
          <p>最新记录：第 {latest.day} 天 · {formatTrendValue(latest.value)} {config.unit}。仅呈现记录，不预设目标。</p>
        </>
      ) : <p className="trend-empty">记录后生成趋势线</p>}
    </article>
  );
}

export function RecordTrends({ records }: { records: DayRecord[] }) {
  return (
    <section className="record-trends" aria-label="21 天身体记录趋势">
      <div className="record-trends-heading"><span>MY 21-DAY RECORD</span><h3>真实记录，看得见。</h3><p>体重与腰围分别呈现；只连接相邻有记录的日期，不用推测值补齐。</p></div>
      <div className="trend-grid trend-grid-stacked"><TrendChart records={records} metric="weight" /><TrendChart records={records} metric="waist" /></div>
    </section>
  );
}
