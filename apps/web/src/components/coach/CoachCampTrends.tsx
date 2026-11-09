import { useEffect, useState } from "react";
import CampTrendCharts from "../admin/CampTrendCharts";
import type { AccessProfile } from "../../services/accessProfile";
import {
  fetchCoachCampTrends,
  fetchMyCoachPromotionState,
  type CoachCampTrendRow,
  type CoachCampTrendScope,
  type CoachPromotionState,
} from "../../services/coachCampTrends";

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

export default function CoachCampTrends({ accessRole }: { accessRole?: AccessProfile["role"] }) {
  const [scope, setScope] = useState<CoachCampTrendScope>("own");
  const [rows, setRows] = useState<CoachCampTrendRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [promotionState, setPromotionState] = useState<CoachPromotionState | null>(null);
  const [promotionStatus, setPromotionStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let alive = true;
    fetchMyCoachPromotionState().then((state) => {
      if (!alive) return;
      setPromotionState(state);
      setPromotionStatus("ready");
      if (state === "probational_coach") setScope("own");
    }).catch(() => {
      if (!alive) return;
      setPromotionState(null);
      setPromotionStatus("error");
      setScope("own");
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setRows(null);
    fetchCoachCampTrends(scope).then((result) => {
      if (alive) setRows(result);
    }).catch((cause: unknown) => {
      if (alive) setError(cause instanceof Error ? cause.message : "趋势读取失败，请稍后重试。");
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [scope]);

  const canViewAll = promotionStatus === "ready"
    && promotionState !== "probational_coach"
    && (accessRole === "coach" || accessRole === "admin" || promotionState === "coach");
  const isEmpty = rows?.every((row) => row.participants === 0 && row.weight_samples === 0 && row.waist_samples === 0) ?? false;

  return (
    <section className="admin-block coach-dashboard-panel" aria-labelledby="coach-camp-trends-title">
      <div className="admin-block-heading">
        <h2 id="coach-camp-trends-title">D1–D21 营期趋势</h2>
        <div className="coach-trend-scope" role="group" aria-label="趋势数据范围">
          <button type="button" className="admin-secondary" aria-pressed={scope === "own"} onClick={() => setScope("own")}>本人名下</button>
          {canViewAll && <button type="button" className="admin-secondary" aria-pressed={scope === "all"} onClick={() => setScope("all")}>全栈</button>}
        </div>
      </div>
      {loading && <p role="status">趋势加载中…</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      {isEmpty && <p className="admin-empty">暂无趋势数据</p>}
      {rows && !isEmpty && (
        <CampTrendCharts metrics={rows.map((row) => ({
          dayIndex: row.day_index,
          participants: row.participants,
          avgWeightChangePercent: row.avg_weight_change_percent,
          avgWaistChangePercent: row.avg_waist_change_percent,
          mealCompletionRate: row.meal_completion_rate,
          waterRate: row.water_rate,
          movementRate: row.movement_rate,
          sleepRate: row.sleep_rate,
        }))} />
      )}
      {rows && (
        <div className="admin-table-wrap" tabIndex={0} aria-label="D1 至 D21 聚合趋势表，可横向滚动">
          <table className="admin-table coach-camp-trends-table">
            <caption>D1 至 D21 聚合趋势数据</caption>
            <thead><tr><th>营期日</th><th>打卡人数</th><th>体重样本</th><th>腰围样本</th><th>平均体重变化</th><th>平均腰围变化</th><th>三餐完成率</th><th>饮水率</th><th>运动率</th><th>睡眠率</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.day_index}>
                  <td>D{row.day_index}</td>
                  <td>{row.participants}</td>
                  <td>{row.weight_samples}</td>
                  <td>{row.waist_samples}</td>
                  <td>{formatPercent(row.avg_weight_change_percent)}</td>
                  <td>{formatPercent(row.avg_waist_change_percent)}</td>
                  <td>{formatPercent(row.meal_completion_rate)}</td>
                  <td>{formatPercent(row.water_rate)}</td>
                  <td>{formatPercent(row.movement_rate)}</td>
                  <td>{formatPercent(row.sleep_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
