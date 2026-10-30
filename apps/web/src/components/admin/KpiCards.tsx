import type { CampKpis } from "../../utils/adminMetrics";

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function formatChange(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value}%`;
}

export default function KpiCards({ kpis }: { kpis: CampKpis }) {
  const cards = [
    { label: "总营员数", value: `${kpis.totalCampers} 人`, note: "已备份到云端" },
    {
      label: "绑定邮箱比例",
      value: formatPercent(kpis.boundRate),
      note: `${kpis.boundCampers} / ${kpis.totalCampers} 人已绑定`,
    },
    { label: "今日打卡人数", value: `${kpis.todayCheckedIn} 人`, note: "按本地日期统计" },
    {
      label: "全营平均体重变化",
      value: formatChange(kpis.avgWeightChangePercent),
      note: "各自最新记录对首条基线",
    },
  ];
  return (
    <section className="admin-kpis" aria-label="全局数据看板">
      {cards.map((card) => (
        <div className="admin-kpi-card" key={card.label}>
          <p className="admin-kpi-label">{card.label}</p>
          <p className="admin-kpi-value">{card.value}</p>
          <p className="admin-kpi-note">{card.note}</p>
        </div>
      ))}
    </section>
  );
}
