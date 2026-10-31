import { useState } from "react";
import { RecordTrends } from "../RecordTrends";
import { GraduationCert } from "../GraduationCert";
import { createRecordPoster } from "../../utils/recordPoster";
import { exportCheckInCsv, type CheckInState } from "../../utils/checkin";
import { openSyncModal, type SyncMilestoneKind } from "../../services/syncUi";
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

  const openMilestoneBinding = (kind: SyncMilestoneKind, onSuccess: () => void) => {
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

  const requestCertificate = (action: () => void) => {
    if (requiresMilestoneBinding) openMilestoneBinding("certificate", action);
    else action();
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
          <h3 id="poster-export-title">把坚持的成果，变成你的专属成就。</h3>
          <p>用真实数据见证 21 天的自我管理轨迹。支持微信内长按保存，或下载高清 PNG 分享。CSV 数据可直接用于个人建档参考。</p>
          <button type="button" onClick={requestPoster}>生成专属成就海报</button>
          <button type="button" className="csv-export" onClick={exportCsv}>导出完整数据 (CSV)</button>
          {posterError && <p role="alert">当前浏览器无法生成海报，请更换浏览器后重试。</p>}
        </div>
        {posterUrl && <div className="poster-preview"><img src={posterUrl} alt="21 天健康记录海报预览" /><p>微信内可长按图片保存；也可以<a href={posterUrl} download="菌衡计划-21天健康记录.png">下载 PNG 海报</a>。</p><small>仅为个人健康记录，不代表固定减重目标或产品功效</small></div>}
      </section>
      <GraduationCert state={state} recordName={recordName} onRequest={requestCertificate} />
    </div>
  );
}
