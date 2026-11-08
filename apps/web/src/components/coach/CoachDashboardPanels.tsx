import { useEffect, useState } from "react";
import { fetchCoachRadar, type CoachRadarRow } from "../../services/coachRadar";
import CoachCodeInventory from "./CoachCodeInventory";

function MetricValue({ value, unit = "" }: { value: number | null; unit?: string }) {
  return <>{value === null ? "--" : `${value > 0 && unit ? "+" : ""}${value.toFixed(1)}${unit ? ` ${unit}` : ""}`}</>;
}

function CoachMetricTable({ rows }: { rows: CoachRadarRow[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table coach-dashboard-table">
        <thead><tr><th>体验官</th><th>体重变化</th><th>腰围变化</th><th>BMI</th><th>状态</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.camperCode}>
              <td>{row.camperCode}</td>
              <td><MetricValue value={row.weightDelta} unit="kg" /></td>
              <td><MetricValue value={row.waistDelta} unit="cm" /></td>
              <td><MetricValue value={row.bmi} /></td>
              <td><span className={`status-tag status-tag--${row.alertLevel}`}>{row.alertLevel === "green" ? "绿灯" : row.alertLevel === "yellow" ? "黄灯" : "红灯"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CoachDashboardPanels() {
  const [rows, setRows] = useState<CoachRadarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetchCoachRadar().then((value) => {
      if (alive) setRows(value);
    }).catch((cause: unknown) => {
      if (alive) setError(cause instanceof Error ? cause.message : "雷达读取失败，请稍后重试。");
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const activeRows = rows.filter((row) => row.alertLevel === "green");
  const dormantRows = rows.filter((row) => row.alertLevel !== "green");
  const quarter = Math.floor(new Date().getMonth() / 3) + 1;

  return (
    <div className="coach-dashboard-grid">
      <div className="coach-dashboard-main">
        <section className="admin-block coach-dashboard-panel" aria-labelledby="coach-active-title">
          <div className="admin-block-heading"><h2 id="coach-active-title">名下活跃用户</h2><span>{activeRows.length} 人 · 绿灯</span></div>
          {loading && <p role="status">活跃用户加载中…</p>}
          {error && <p className="admin-error" role="alert">{error}</p>}
          {!loading && !error && activeRows.length === 0 && <p className="admin-empty">暂无绿灯活跃用户。</p>}
          {activeRows.length > 0 && <CoachMetricTable rows={activeRows} />}
        </section>
        <section className="admin-block coach-dashboard-panel" aria-labelledby="coach-dormant-title">
          <div className="admin-block-heading"><h2 id="coach-dormant-title">休眠雷达</h2><span>{dormantRows.length} 人 · 红黄灯优先跟进</span></div>
          {!loading && !error && dormantRows.length === 0 && <p className="admin-empty">暂无红黄灯休眠营员。</p>}
          {dormantRows.length > 0 && <CoachMetricTable rows={dormantRows} />}
        </section>
      </div>
      <aside className="coach-dashboard-side">
        <section className="admin-block coach-dashboard-panel" aria-labelledby="coach-inventory-title">
          <h2 id="coach-inventory-title">教练云仓库存</h2>
          <CoachCodeInventory />
        </section>
        <section className="admin-block coach-dashboard-panel coach-quarter-card" aria-labelledby="coach-quarter-title">
          <h2 id="coach-quarter-title">季度推荐提醒</h2>
          <strong>Q{quarter} 服务复盘</strong>
          <p>优先跟进休眠雷达中的红黄灯营员，并结合本人可用库存安排补货；不以空指标代替首测数据。</p>
        </section>
      </aside>
    </div>
  );
}
