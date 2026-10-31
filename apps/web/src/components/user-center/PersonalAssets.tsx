import { useState } from "react";
import { RecordTrends } from "../RecordTrends";
import { createRecordPoster } from "../../utils/recordPoster";
import { exportCheckInCsv, type CheckInState } from "../../utils/checkin";
import { openSyncModal } from "../../services/syncUi";
import type { DayRecord } from "../../types/checkin";

type PersonalAssetsProps = {
  state: CheckInState;
  records: DayRecord[];
  recordName: string;
  endDate: string;
  requiresMilestoneBinding: boolean;
};

/** 趋势、海报与 CSV 均接收明确的档案 props，不读取打卡页组件状态。 */
export function PersonalAssets({ state, records, recordName, endDate, requiresMilestoneBinding }: PersonalAssetsProps) {
  const [posterUrl, setPosterUrl] = useState("");
  const [posterError, setPosterError] = useState(false);
  const [trendUnlocked, setTrendUnlocked] = useState(false);

  const buildPoster = () => createRecordPoster(records, recordName, {
    userCode: state.userCode,
    startDate: state.startDate,
    endDate,
  });

  const exportPoster = () => {
    try {
      setPosterUrl(buildPoster());
      setPosterError(false);
    } catch {
      setPosterError(true);
    }
  };

  const openMilestoneBinding = (kind: "poster" | "trend", onSuccess: () => void) => {
    let previewUrl = "";
    try { previewUrl = buildPoster(); } catch { /* 无 Canvas 时仅降级头图 */ }
    openSyncModal("bind", { milestone: true, milestoneKind: kind, posterUrl: previewUrl, onSuccess });
  };

  const requestPoster = () => {
    if (requiresMilestoneBinding) openMilestoneBinding("poster", exportPoster);
    else exportPoster();
  };

  const requestTrends = () => {
    if (requiresMilestoneBinding) openMilestoneBinding("trend", () => setTrendUnlocked(true));
    else setTrendUnlocked(true);
  };

  const exportCsv = () => {
    const blob = new Blob([exportCheckInCsv(state)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `菌衡计划-21天打卡-${state.userCode}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="personal-assets">
      {!requiresMilestoneBinding || trendUnlocked ? (
        <RecordTrends records={records} />
      ) : (
        <section className="record-trends record-trends-locked" aria-label="21 天身体记录趋势">
          <div className="record-trends-heading"><span>MY 21-DAY RECORD</span><h3>真实记录，看得见。</h3><p>专属健康趋势已经生成。绑定邮箱后即可查看，换手机或清理缓存也能恢复记录。</p></div>
          <button type="button" className="trend-unlock-button" onClick={requestTrends}>查看趋势图</button>
        </section>
      )}
      <section className="poster-export" aria-labelledby="poster-export-title">
        <div className="poster-export-copy">
          <span>PERSONAL RECORD POSTER</span>
          <h3 id="poster-export-title">把 21 天坚持，留成一张海报。</h3>
          <p>只导出你的真实记录，不生成固定减重目标。微信内可长按图片保存，其他浏览器可下载 PNG。CSV 含营员代码与真实日期，可直接用 Excel 汇总统计。</p>
          <button type="button" onClick={requestPoster}>导出记录海报</button>
          <button type="button" className="csv-export" onClick={exportCsv}>导出打卡 CSV</button>
          {posterError && <p role="alert">当前浏览器无法生成海报，请更换浏览器后重试。</p>}
        </div>
        {posterUrl && <div className="poster-preview"><img src={posterUrl} alt="21 天健康记录海报预览" /><p>微信内可长按图片保存；也可以<a href={posterUrl} download="菌衡计划-21天健康记录.png">下载 PNG 海报</a>。</p><small>仅为个人健康记录，不代表固定减重目标或产品功效</small></div>}
      </section>
    </div>
  );
}
