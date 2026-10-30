import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CampDayMetric } from "../../services/adminCheckin";

const ACID = "#a3e635";
const WAIST = "#7dd3fc";
const GRID = "rgba(243, 241, 232, 0.12)";
const TICK = "rgba(243, 241, 232, 0.6)";

const tooltipStyle = {
  background: "#0c1f16",
  border: "1px solid rgba(243, 241, 232, 0.2)",
  borderRadius: 0,
  fontSize: 12,
  color: "#f3f1e8",
};

function axisProps() {
  return {
    stroke: GRID,
    tick: { fill: TICK, fontSize: 11 },
    tickLine: false as const,
  };
}

export default function CampTrendCharts({ metrics }: { metrics: CampDayMetric[] }) {
  const data = metrics.map((metric) => ({
    day: `D${metric.dayIndex}`,
    weight: metric.avgWeightChangePercent,
    waist: metric.avgWaistChangePercent,
    participants: metric.participants,
  }));

  return (
    <div className="admin-charts">
      <figure className="admin-chart">
        <figcaption>平均体重 / 腰围变化（%）· 相对各自首条基线</figcaption>
        <div className="admin-chart-canvas" role="img" aria-label="D1 至 D21 平均体重与腰围变化折线图">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="day" {...axisProps()} interval={1} />
              <YAxis {...axisProps()} unit="%" />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number | string) => `${value}%`} />
              <Line type="monotone" dataKey="weight" name="体重变化" stroke={ACID} strokeWidth={2} dot={{ r: 2, fill: ACID }} connectNulls={false} />
              <Line type="monotone" dataKey="waist" name="腰围变化" stroke={WAIST} strokeWidth={2} dot={{ r: 2, fill: WAIST }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="admin-chart-legend"><span style={{ color: ACID }}>■ 体重变化</span><span style={{ color: WAIST }}>■ 腰围变化</span></p>
      </figure>

      <figure className="admin-chart">
        <figcaption>每日实际打卡人数 · 观察留存与流失</figcaption>
        <div className="admin-chart-canvas" role="img" aria-label="D1 至 D21 每日打卡人数柱状图">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="day" {...axisProps()} interval={1} />
              <YAxis {...axisProps()} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(163, 230, 53, 0.08)" }} />
              <Bar dataKey="participants" name="打卡人数" fill={ACID} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  );
}
