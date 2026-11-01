import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { roundBmi, type BmiPoint } from "../../utils/bmi";
import { formatShortDate } from "../../utils/checkin";

export function BmiTrendChart({ points }: { points: BmiPoint[] }) {
  const data = points.map((point) => ({
    date: formatShortDate(point.date),
    bmi: roundBmi(point.bmi),
  }));

  return (
    <section className="bmi-trend" aria-labelledby="bmi-trend-title">
      <header><span>PERSONAL TREND</span><h3 id="bmi-trend-title">BMI 走势</h3></header>
      <div className="bmi-trend-chart" role="img" aria-label="BMI 动态趋势图">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke="rgba(243, 241, 232, .12)" />
            <XAxis dataKey="date" tick={{ fill: "rgba(243, 241, 232, .62)", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis domain={["auto", "auto"]} tick={{ fill: "rgba(243, 241, 232, .62)", fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: "#0d2b20", border: "1px solid rgba(243, 241, 232, .18)", borderRadius: 0, color: "#f3f1e8" }}
              labelStyle={{ color: "rgba(243, 241, 232, .62)" }}
            />
            <Line type="monotone" dataKey="bmi" name="BMI" stroke="#c8ff3d" strokeWidth={2.5} dot={{ r: 4, fill: "#c8ff3d", strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p>仅呈现真实打卡日数据</p>
    </section>
  );
}
