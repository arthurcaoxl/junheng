import { useEffect, useMemo, useRef } from "react";
import type { AdminCamper } from "../../services/adminCheckin";
import { buildCamperDays } from "../../utils/adminMetrics";

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value}%`;
}

function Check({ on }: { on: boolean }) {
  return <span className={on ? "admin-check on" : "admin-check"} aria-label={on ? "已完成" : "未完成"}>{on ? "✓" : "—"}</span>;
}

type Props = {
  camper: AdminCamper | null;
  onClose: () => void;
};

export default function CamperDrawer({ camper, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const days = useMemo(() => (camper ? buildCamperDays(camper) : []), [camper]);

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

  return (
    <div className="admin-drawer-layer" role="presentation" onClick={onClose}>
      <aside
        className="admin-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-drawer-heading">
          <div>
            <p className="admin-eyebrow">CAMPER DETAIL</p>
            <h2 id="admin-drawer-title">{camper.userCode}</h2>
            <p className="admin-drawer-sub">{camper.email} · 开营 {camper.startDate} · 累计 {camper.recordedDays} 天</p>
          </div>
          <button ref={closeRef} type="button" className="admin-secondary" onClick={onClose}>关闭</button>
        </div>

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
                  <td>{day.record?.weight || "—"}</td>
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
        <p className="admin-hint">体重/腰围变化相对该营员首条有效记录；「—」表示当天未打卡或未填写。</p>
      </aside>
    </div>
  );
}
