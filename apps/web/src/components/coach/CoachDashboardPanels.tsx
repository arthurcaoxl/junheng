import { useEffect, useState } from "react";
import { fetchMyAccessProfile, type AccessProfile } from "../../services/accessProfile";
import {
  fetchCoachCampers,
  fetchCoachRadar,
  saveCoachCamperFollowup,
  type CoachCamper,
  type CoachRadarRow,
  type FollowupStatus,
} from "../../services/coachRadar";
import CoachCodeInventory from "./CoachCodeInventory";

type WorkbenchRow = CoachRadarRow & CoachCamper;

const FOLLOWUP_OPTIONS: { value: FollowupStatus; label: string }[] = [
  { value: "pending", label: "待跟进" },
  { value: "contacted", label: "已触达" },
  { value: "waiting_reply", label: "待回复" },
  { value: "resolved", label: "已解决" },
  { value: "escalated", label: "需升级" },
];

const DEMO_ROWS = [
  { isDemo: true as const, code: "DEMO-NEW", kind: "新注册", light: "红灯", note: "尚无真实打卡；先完成首测与激活引导。" },
  { isDemo: true as const, code: "DEMO-ACTIVE", kind: "活跃", light: "绿灯", note: "窗口内已有有效打卡；持续跟进服务。" },
];

function MetricValue({ value, unit = "" }: { value: number | null; unit?: string }) {
  return <>{value === null ? "--" : `${value > 0 && unit ? "+" : ""}${value.toFixed(1)}${unit ? ` ${unit}` : ""}`}</>;
}

function FollowupEditor({ row }: { row: WorkbenchRow }) {
  const [status, setStatus] = useState<FollowupStatus>(row.followupStatus);
  const [note, setNote] = useState(row.followupNote);
  const [version, setVersion] = useState(row.followupVersion);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      const result = await saveCoachCamperFollowup(row.camperRef, status, note, version);
      setVersion(result.version);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "跟进保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="coach-followup-editor">
      <label htmlFor={`followup-status-${row.camperRef}`}>跟进状态 {row.camperCode}</label>
      <select id={`followup-status-${row.camperRef}`} value={status} onChange={(event) => { setStatus(event.target.value as FollowupStatus); setSaved(false); }}>
        {FOLLOWUP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <label htmlFor={`followup-note-${row.camperRef}`}>跟进备注 {row.camperCode}</label>
      <textarea id={`followup-note-${row.camperRef}`} maxLength={1000} value={note} onChange={(event) => { setNote(event.target.value); setSaved(false); }} />
      <button type="button" className="admin-secondary" disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : `保存 ${row.camperCode} 跟进`}</button>
      {saved && <span className="admin-notice" role="status">跟进已保存</span>}
      {error && <span className="admin-error" role="alert">{error}</span>}
    </div>
  );
}

function CoachMetricTable({ rows }: { rows: WorkbenchRow[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table coach-dashboard-table">
        <thead><tr><th>体验官</th><th>体重变化</th><th>腰围变化</th><th>BMI</th><th>状态</th><th>跟进</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.camperRef}>
              <td>{row.camperCode}</td>
              <td><MetricValue value={row.weightDelta} unit="kg" /></td>
              <td><MetricValue value={row.waistDelta} unit="cm" /></td>
              <td><MetricValue value={row.bmi} /></td>
              <td><span className={`status-tag status-tag--${row.alertLevel}`}>{row.alertLevel === "green" ? "绿灯" : row.alertLevel === "yellow" ? "黄灯" : "红灯"}</span></td>
              <td><FollowupEditor row={row} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CoachDashboardPanels({ onRole }: { onRole?: (role: AccessProfile["role"]) => void }) {
  const [rows, setRows] = useState<CoachRadarRow[]>([]);
  const [campers, setCampers] = useState<CoachCamper[]>([]);
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([fetchMyAccessProfile(), fetchCoachRadar(), fetchCoachCampers()]).then(([access, radar, nextCampers]) => {
      if (!alive) return;
      setProfile(access);
      onRole?.(access.role);
      
      if (access.canViewRadar) {
        const radarByCode = new Map(radar.map((row) => [row.camperCode, row]));
        setCampers(nextCampers);
        setRows(nextCampers.flatMap((camper) => {
          const metrics = radarByCode.get(camper.camperCode);
          return metrics ? [{ ...metrics, ...camper }] : [];
        }));
      } else {
        setRows([]);
        setCampers([]);
      }
    }).catch((cause: unknown) => {
      if (alive) setError(cause instanceof Error ? cause.message : "雷达读取失败，请稍后重试。");
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [onRole]);

  const newRows = rows.filter((row) => row.activityStatus === "new_registered");
  const activeRows = rows.filter((row) => row.activityStatus === "active" && row.alertLevel === "green");
  const dormantRows = rows.filter((row) => row.activityStatus === "active" && row.alertLevel !== "green");
  const quarter = Math.floor(new Date().getMonth() / 3) + 1;

  return (
    <div className="coach-dashboard-grid">
      <div className="coach-dashboard-main">
        {error && <p className="admin-error" role="alert">{error}</p>}
        <section className="admin-block coach-dashboard-panel" aria-labelledby="coach-new-title">
          <div className="admin-block-heading"><h2 id="coach-new-title">新注册用户</h2><span>{newRows.length} 人 · 当前 21 天窗口内尚无有效打卡</span></div>
          {loading && <p role="status">新注册用户加载中…</p>}
          {!loading && !error && newRows.length === 0 && <p className="admin-empty">暂无新注册用户。</p>}
          {newRows.length > 0 && <CoachMetricTable rows={newRows} />}
        </section>
        <section className="admin-block coach-dashboard-panel" aria-labelledby="coach-active-title">
          <div className="admin-block-heading"><h2 id="coach-active-title">名下活跃用户</h2><span>{activeRows.length} 人 · 窗口内有有效打卡且当前绿灯</span></div>
          {!loading && !error && activeRows.length === 0 && <p className="admin-empty">暂无绿灯活跃用户。</p>}
          {activeRows.length > 0 && <CoachMetricTable rows={activeRows} />}
        </section>
        <section className="admin-block coach-dashboard-panel" aria-labelledby="coach-dormant-title">
          <div className="admin-block-heading"><h2 id="coach-dormant-title">休眠雷达</h2><span>{dormantRows.length} 人 · 已有打卡的红黄灯优先跟进</span></div>
          {!loading && !error && dormantRows.length === 0 && <p className="admin-empty">暂无红黄灯休眠营员。</p>}
          {dormantRows.length > 0 && <CoachMetricTable rows={dormantRows} />}
        </section>
        {!loading && !error && campers.length === 0 && (
          <section className="admin-block coach-dashboard-panel coach-demo" aria-label="演示数据，非真实统计">
            <p className="admin-eyebrow">DEMO ONLY · 演示数据 / 非真实统计</p>
            <h2>新教练功能引导</h2>
            <p>以下营员与库存均为明确虚构示例，不进入上方人数、灯号、云仓或任何云端请求。</p>
            <div className="coach-demo-grid">
              {DEMO_ROWS.map((row) => <article key={row.code}><strong>{row.code}</strong><span>{row.kind} · {row.light}</span><p>{row.note}</p></article>)}
              <article><strong>虚构库存</strong><span>3 枚 · 仅示意云仓位置</span><p>无真实码面，也不能复制、直推或申请审核。</p></article>
            </div>
          </section>
        )}
      </div>
      <aside className="coach-dashboard-side">
      {profile?.canManageInventory && (
        <section className="admin-block coach-dashboard-panel" aria-labelledby="coach-inventory-title">
          <h2 id="coach-inventory-title">教练云仓库存</h2>
          <CoachCodeInventory campers={campers} />
        </section>
      )}
        <section className="admin-block coach-dashboard-panel coach-quarter-card" aria-labelledby="coach-quarter-title">
          <h2 id="coach-quarter-title">季度推荐提醒</h2>
          <strong>Q{quarter} 服务复盘</strong>
          <p>{profile?.role === "staff"
            ? "优先跟进分配范围内红黄灯体验官；不得查看库存、财务或原始健康档案。"
            : "优先跟进休眠雷达中的红黄灯营员，并结合本人可用库存安排补货；不以空指标代替首测数据。"}</p>
        </section>
      </aside>
    </div>
  );
}
