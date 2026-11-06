import { useEffect, useState } from "react";
import { CoachRadarPermissionError, fetchCoachRadar, type CoachRadarRow } from "../../services/coachRadar";
import CoachRadarTable from "./CoachRadarTable";

type RadarState =
  | { status: "loading"; rows: CoachRadarRow[] }
  | { status: "ready"; rows: CoachRadarRow[] }
  | { status: "error"; rows: CoachRadarRow[] }
  | { status: "forbidden"; rows: CoachRadarRow[] };

export default function CoachRadar() {
  const [state, setState] = useState<RadarState>({ status: "loading", rows: [] });

  useEffect(() => {
    let alive = true;
    fetchCoachRadar()
      .then((rows) => {
        if (alive) setState({ status: "ready", rows });
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setState({
          status: error instanceof CoachRadarPermissionError ? "forbidden" : "error",
          rows: [],
        });
      });
    return () => { alive = false; };
  }, []);

  return (
    <section className="admin-block coach-radar" aria-labelledby="coach-radar-title">
      <div className="admin-block-heading">
        <h2 id="coach-radar-title">教练雷达</h2>
        <span>仅展示服务端返回的脱敏指标与灯号</span>
      </div>
      {state.status === "loading" && <p role="status">教练雷达加载中…</p>}
      {state.status === "error" && <p className="admin-error" role="alert">雷达读取失败，请稍后重试。</p>}
      {state.status === "forbidden" && <p className="admin-error" role="alert">暂无教练雷达查看权限</p>}
      {state.status === "ready" && state.rows.length === 0 && (
        <div className="admin-empty">
          <p>暂无可见营员</p>
          <p>如应有可见营员，请联系管理员确认权限</p>
        </div>
      )}
      {state.status === "ready" && state.rows.length > 0 && <CoachRadarTable rows={state.rows} />}
    </section>
  );
}
