import type { CoachRadarAlert, CoachRadarRow } from "../../services/coachRadar";

const ALERT_LABELS: Record<CoachRadarAlert, string> = {
  red: "红灯",
  yellow: "黄灯",
  green: "绿灯",
};

function formatOneDecimal(value: number): string {
  const rounded = Math.sign(value) * Math.round(Math.abs(value) * 10) / 10;
  return rounded.toFixed(1);
}

function formatDelta(value: number | null, unit: "kg" | "cm"): string {
  if (value === null) return "--";
  return `${value > 0 ? "+" : ""}${formatOneDecimal(value)} ${unit}`;
}

function formatBmi(value: number | null): string {
  return value === null ? "--" : formatOneDecimal(value);
}

export default function CoachRadarTable({ rows }: { rows: CoachRadarRow[] }) {
  return (
    <div className="admin-table-wrap" tabIndex={0} aria-label="教练雷达数据表，可横向滚动">
      <table className="admin-table coach-radar-table">
        <thead>
          <tr>
            <th>体验官</th>
            <th>体重变化</th>
            <th>腰围变化</th>
            <th>BMI</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.camperCode}>
              <td>{row.camperCode}</td>
              <td>{formatDelta(row.weightDelta, "kg")}</td>
              <td>{formatDelta(row.waistDelta, "cm")}</td>
              <td>{formatBmi(row.bmi)}</td>
              <td>
                <span className={`status-tag status-tag--${row.alertLevel}`}>
                  {ALERT_LABELS[row.alertLevel]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
