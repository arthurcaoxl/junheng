import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminCamper, AdminFollowupStatus } from "../../services/adminCheckin";
import { fetchAdminCamperFollowup, saveAdminCamperFollowup } from "../../services/adminCheckin";
import { buildCamperDays, getOutOfWindowRecordDates, toWindowRecords } from "../../utils/adminMetrics";
import { addDays, TOTAL_DAYS } from "../../utils/checkin";
import { createRecordPoster } from "../../utils/recordPoster";
import { getRepresentativeWeight } from "../../utils/weight";
import { RecordTrends } from "../RecordTrends";

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value}%`;
}

function Check({ on }: { on: boolean }) {
  return <span className={on ? "admin-check on" : "admin-check"} aria-label={on ? "已完成" : "未完成"}>{on ? "✓" : "—"}</span>;
}

const ADMIN_FOLLOWUP_OPTIONS: { value: AdminFollowupStatus; label: string }[] = [
  { value: "pending", label: "待跟进" },
  { value: "contacted", label: "已触达" },
  { value: "waiting_reply", label: "待回复" },
  { value: "resolved", label: "已解决" },
  { value: "escalated", label: "需升级" },
];

function AdminFollowupEditor({ camperId }: { camperId: string }) {
  const [status, setStatus] = useState<AdminFollowupStatus>("pending");
  const [note, setNote] = useState("");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [unbound, setUnbound] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    fetchAdminCamperFollowup(camperId).then((value) => {
      if (!alive) return;
      setStatus(value.followupStatus);
      setNote(value.note);
      setVersion(value.version);
    }).catch((cause: unknown) => {
      if (!alive) return;
      if (cause instanceof Error && cause.name === "AdminFollowupForbiddenError") {
        setUnbound(true);
        return;
      }
      setError(cause instanceof Error ? cause.message : "跟进读取失败");
    });
    return () => { alive = false; };
  }, [camperId]);

  const save = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await saveAdminCamperFollowup(camperId, status, note, version);
      setVersion(result.version);
      setNotice("Admin 跟进已保存");
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AdminFollowupForbiddenError") {
        setUnbound(true);
      } else {
        setError(cause instanceof Error ? cause.message : "跟进保存失败");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-followup-editor" aria-label="Admin 跟进记录">
      <h3>跟进记录</h3>
      {unbound ? (
        <p className="admin-empty" role="status">暂未绑定教练，分配后可跟进</p>
      ) : (
        <>
          <label htmlFor="admin-followup-status">Admin 跟进状态</label>
          <select id="admin-followup-status" value={status} onChange={(event) => setStatus(event.target.value as AdminFollowupStatus)}>
            {ADMIN_FOLLOWUP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <label htmlFor="admin-followup-note">Admin 跟进备注</label>
          <textarea id="admin-followup-note" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
          <button type="button" className="admin-secondary" disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "保存 Admin 跟进"}</button>
          {notice && <p className="admin-notice" role="status">{notice}</p>}
          {error && <p className="admin-error" role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}

export type CamperDrawerTab = "detail" | "trend" | "poster";

const TABS: { key: CamperDrawerTab; label: string }[] = [
  { key: "detail", label: "数据明细" },
  { key: "trend", label: "个人趋势" },
  { key: "poster", label: "打卡海报" },
];

type Props = {
  camper: AdminCamper | null;
  initialTab?: CamperDrawerTab;
  onClose: () => void;
};

export default function CamperDrawer({ camper, initialTab = "detail", onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<CamperDrawerTab>(initialTab);
  const days = useMemo(() => (camper ? buildCamperDays(camper) : []), [camper]);
  const windowRecords = useMemo(() => (camper ? toWindowRecords(camper) : []), [camper]);
  const outOfWindowDates = useMemo(() => (camper ? getOutOfWindowRecordDates(camper) : []), [camper]);

  // 与前台共用同一套海报绘制逻辑，仅在打开海报 Tab 时生成
  const posterUrl = useMemo(() => {
    if (!camper || tab !== "poster") return "";
    try {
      return createRecordPoster(windowRecords, "", {
        userCode: camper.userCode,
        startDate: camper.startDate,
        endDate: addDays(camper.startDate, TOTAL_DAYS - 1),
      });
    } catch {
      return "";
    }
  }, [camper, tab, windowRecords]);

  useEffect(() => {
    if (!camper) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [camper, onClose]);

  if (!camper) return null;

  const downloadPoster = () => {
    if (!posterUrl) return;
    const anchor = document.createElement("a");
    anchor.href = posterUrl;
    anchor.download = `菌衡计划-打卡海报-${camper.userCode}.png`;
    anchor.click();
  };

  return (
    <div className="admin-drawer-layer" role="presentation" onClick={onClose}>
      <aside
        className="admin-drawer admin-drawer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-drawer-heading">
          <div>
            <p className="admin-eyebrow">CAMPER DETAIL</p>
            <h2 id="admin-drawer-title">{camper.userCode}</h2>
            <p className="admin-drawer-sub">
              {camper.email} · 开营 {camper.startDate} · 本期累计 {camper.recordedDays} 天
              {outOfWindowDates.length > 0 && ` · 窗口外 ${outOfWindowDates.length} 天`}
            </p>
          </div>
          <button ref={closeRef} type="button" className="admin-secondary" onClick={onClose}>关闭</button>
        </div>

        <div className="admin-tabs" role="tablist" aria-label="体验官详情视图">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              className={`admin-tab${tab === item.key ? " is-active" : ""}`}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "detail" && (
          <div role="tabpanel" aria-label="数据明细">
            {outOfWindowDates.length > 0 && (
              <p className="admin-hint" role="status">
                当前窗口外另有 {outOfWindowDates.length} 天有效记录（{outOfWindowDates.join("、")}）。数据仍保留；下方明细、个人趋势与海报仅展示本期 21 天。
              </p>
            )}
            <AdminFollowupEditor camperId={camper.authUserId} />
            <div className="admin-table-wrap admin-drawer-table-wrap" tabIndex={0} aria-label="个人 D1 至 D21 明细，可横向滚动">
              <table className="admin-table admin-drawer-table">
                <thead>
                  <tr>
                    <th>营期日</th>
                    <th>日期</th>
                    <th>体重 kg</th>
                    <th>体重变化</th>
                    <th>腰围 cm</th>
                    <th>腰围变化</th>
                    <th>早餐前</th>
                    <th>午餐前</th>
                    <th>晚餐前</th>
                    <th>饮水</th>
                    <th>运动</th>
                    <th>作息</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => (
                    <tr key={day.dayIndex} className={day.record ? "" : "admin-day-empty"}>
                      <td>D{day.dayIndex}</td>
                      <td>{day.date.slice(5)}</td>
                      <td>{day.record ? getRepresentativeWeight(day.record) || "—" : "—"}</td>
                      <td>{formatPercent(day.weightChangePercent)}</td>
                      <td>{day.record?.waist || "—"}</td>
                      <td>{formatPercent(day.waistChangePercent)}</td>
                      <td><Check on={Boolean(day.record?.meals[0])} /></td>
                      <td><Check on={Boolean(day.record?.meals[1])} /></td>
                      <td><Check on={Boolean(day.record?.meals[2])} /></td>
                      <td><Check on={Boolean(day.record?.water)} /></td>
                      <td><Check on={Boolean(day.record?.movement)} /></td>
                      <td><Check on={Boolean(day.record?.sleep)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="admin-hint">体重/腰围变化相对该体验官首条有效记录；「—」表示当天未打卡或未填写。</p>
          </div>
        )}

        {tab === "trend" && (
          <div role="tabpanel" aria-label="个人趋势" className="admin-drawer-trend">
            <RecordTrends records={windowRecords} />
          </div>
        )}

        {tab === "poster" && (
          <div role="tabpanel" aria-label="打卡海报" className="admin-poster-panel">
            {posterUrl ? (
              <>
                <img className="admin-poster-preview" src={posterUrl} alt={`体验官 ${camper.userCode} 的 21 天打卡海报预览`} />
                <div className="admin-poster-actions">
                  <button type="button" className="admin-primary admin-poster-download" onClick={downloadPoster}>下载 PNG 海报</button>
                  <p className="admin-hint">与体验官前台看到的是同一套海报样式，可直接保存后发给本人。</p>
                </div>
              </>
            ) : <p className="admin-error" role="alert">当前浏览器无法生成海报，请换用 Chrome / Safari 重试。</p>}
          </div>
        )}
      </aside>
    </div>
  );
}
