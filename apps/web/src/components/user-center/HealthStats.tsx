import { getPeriodWeightChange } from "../../utils/userCenter";
import type { DayRecord } from "../../types/checkin";

export function HealthStats({ records, recordedDays }: { records: DayRecord[]; recordedDays: number }) {
  const change = getPeriodWeightChange(records);
  const normalizedChange = change !== null && Math.abs(change) < 0.05 ? 0 : change;
  const changeLabel = normalizedChange === null
    ? "—"
    : `${normalizedChange > 0 ? "+" : ""}${normalizedChange.toFixed(1)} kg`;

  return (
    <section className="user-health-stats" aria-label="本期健康统计">
      <article>
        <span>数据样本天数</span>
        <strong>{recordedDays}</strong>
        <small>仅统计本期真实记录</small>
      </article>
      <article>
        <span>核心体重指标变化</span>
        <strong>{changeLabel}</strong>
        <small>{change === null ? "记录满 2 天即可计算变化" : "本期首个至最近有效记录"}</small>
      </article>
    </section>
  );
}
