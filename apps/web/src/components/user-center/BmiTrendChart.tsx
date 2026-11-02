import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { roundBmi, type BmiPoint } from "../../utils/bmi";
import { formatShortDate } from "../../utils/checkin";
import { calculate7DayMovingAverage } from "../../utils/metrics";

export function BmiTrendChart({ points }: { points: BmiPoint[] }) {
  const movingAverage = calculate7DayMovingAverage(points.map((point) => ({ date: point.date, weightKg: point.bmi })));
  const data = points.map((point, index) => ({
    date: formatShortDate(point.date),
    bmi: roundBmi(point.bmi),
    ma7: movingAverage[index].ma7,
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
            <Line type="monotone" dataKey="ma7" name="7 日均线" stroke="#a3e635" strokeWidth={2} strokeDasharray="6 5" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p>仅呈现真实打卡日数据</p>
    </section>
  );
}
