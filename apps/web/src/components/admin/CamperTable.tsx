import type { AdminCamper } from "../../services/adminCheckin";
import { filterCampers, type CamperFilter } from "../../utils/adminMetrics";

const FILTERS: { key: CamperFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "unbound", label: "未绑定邮箱" },
  { key: "inactive2d", label: "连续 2 天未打卡" },
];

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知" : date.toLocaleString("zh-CN", { hour12: false });
}

type Props = {
  campers: AdminCamper[];
  filter: CamperFilter;
  today: string;
  onFilterChange: (filter: CamperFilter) => void;
  onSelect: (camper: AdminCamper) => void;
  onPoster: (camper: AdminCamper) => void;
};

export default function CamperTable({ campers, filter, today, onFilterChange, onSelect, onPoster }: Props) {
  const visible = filterCampers(campers, filter, today);
  return (
    <>
      <div className="admin-filters" role="group" aria-label="营员筛选">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`admin-filter${filter === item.key ? " is-active" : ""}`}
            aria-pressed={filter === item.key}
            onClick={() => onFilterChange(item.key)}
          >
            {item.label}
          </button>
        ))}
        <span className="admin-filter-count">{visible.length} / {campers.length} 人</span>
      </div>
      {visible.length ? (
        <div className="admin-table-wrap" tabIndex={0} aria-label="营员列表，可横向滚动；点击行查看个人明细">
          <table className="admin-table admin-camper-table">
            <thead>
              <tr>
                <th>营员代码</th>
                <th>邮箱</th>
                <th>开营日期</th>
                <th>累计打卡</th>
                <th>最近备份</th>
                <th>操作</th>
                <th><span className="sr-only">查看明细</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((camper) => (
                <tr
                  key={camper.authUserId}
                  className="admin-camper-row"
                  tabIndex={0}
                  role="button"
                  aria-label={`查看营员 ${camper.userCode} 的每日明细`}
                  onClick={() => onSelect(camper)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(camper);
                    }
                  }}
                >
                  <td>{camper.userCode}</td>
                  <td>{camper.email}</td>
                  <td>{camper.startDate}</td>
                  <td>{camper.recordedDays} 天</td>
                  <td>{formatDateTime(camper.updatedAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="admin-poster-shortcut"
                      aria-label={`为营员 ${camper.userCode} 生成海报`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onPoster(camper);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      生成海报
                    </button>
                  </td>
                  <td className="admin-row-arrow" aria-hidden="true">›</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="admin-empty">该筛选条件下暂无营员。</p>}
    </>
  );
}
