import { useUserCenterData } from "../hooks/useUserCenterData";
import { HealthStats } from "../components/user-center/HealthStats";
import { BmiTracker } from "../components/user-center/BmiTracker";
import { PersonalAssets } from "../components/user-center/PersonalAssets";
import { AccountSecurity } from "../components/user-center/AccountSecurity";
import { CoachContactCard } from "../components/user-center/CoachContactCard";
import { GraduationCert } from "../components/GraduationCert";
import { SyncPanel } from "../components/SyncPanel";
import { siteConfig } from "../config/site";
import { scheduleSyncToCloud } from "../services/checkinSync";
import { openSyncModal } from "../services/syncUi";
import { createGraduationCertificate } from "../utils/graduationCertificate";
import { writeV3Snapshot } from "../utils/storageBridge";
import type { CheckInState } from "../utils/checkin";

export default function UserCenter() {
  const { state, setState, recordName, records, stats, configured, email, ready } = useUserCenterData();
  const memberTitle = email ? "研究员" : "脂代谢观察员";

  const saveBmiProfile = (next: CheckInState) => {
    writeV3Snapshot(next);
    setState(next);
    scheduleSyncToCloud();
  };
  const requiresMilestoneBinding = configured && !email && stats.elapsedDays >= 7;
  const requestCertificate = (action: () => void) => {
    if (!requiresMilestoneBinding) {
      action();
      return;
    }
    let posterUrl = "";
    try { posterUrl = createGraduationCertificate(state, recordName); } catch { /* 无 Canvas 时仅降级头图 */ }
    openSyncModal("bind", { milestone: true, milestoneKind: "certificate", posterUrl, onSuccess: action });
  };

  return (
    <section className="user-center section-pad" data-theme="forest" aria-labelledby="user-center-title">
      <header className="user-center-heading">
        <p className="eyebrow">MY LIPID METABOLISM RECORD</p>
        <h1 id="user-center-title">我的脂代谢追踪档案</h1>
        <p className="user-center-intro">记录您的体重、腰围与生活方式，见证科学管理轨迹。</p>
        <p className="user-center-title-note"><strong>{memberTitle}</strong> 品牌会员称号，不代表科研或职业身份。</p>
      </header>
      <div className="user-center-account">
        <span aria-hidden="true">👤</span>
        <div>
          <strong>{recordName.trim() || "脂代谢研究所会员"}</strong>
          <p>体验官代码：<span>{state.userCode}</span></p>
          <p>{email ?? (ready ? "当前设备尚未绑定邮箱" : "正在读取账号状态…")}</p>
        </div>
      </div>
      <CoachContactCard configured={configured} />
      <HealthStats records={records} recordedDays={stats.recordedDays} />
      <PersonalAssets
        state={state}
        records={records}
        recordName={recordName}
        endDate={stats.endDate}
        requiresMilestoneBinding={requiresMilestoneBinding}
        bmiTracker={<BmiTracker state={state} onSave={saveBmiProfile} />}
      />
      <SyncPanel />
      <GraduationCert state={state} recordName={recordName} onRequest={requestCertificate} />
      <AccountSecurity configured={configured} email={email} />
      <p className="platform-disclaimer user-center-disclaimer">{siteConfig.platformDisclaimer}</p>
    </section>
  );
}
