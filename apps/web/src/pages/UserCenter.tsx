import { Link } from "react-router";
import { useUserCenterData } from "../hooks/useUserCenterData";
import { HealthStats } from "../components/user-center/HealthStats";
import { PersonalAssets } from "../components/user-center/PersonalAssets";
import { AccountSecurity } from "../components/user-center/AccountSecurity";
import { SyncPanel } from "../components/SyncPanel";

export default function UserCenter() {
  const { state, recordName, records, stats, configured, email, ready } = useUserCenterData();
  const memberTitle = email ? "研究员" : "脂代谢观察员";

  return (
    <section className="user-center section-pad" data-theme="forest" aria-labelledby="user-center-title">
      <p className="eyebrow">MY LIPID METABOLISM RECORD</p>
      <h1 id="user-center-title">我的脂代谢追踪档案</h1>
      <div className="user-center-account">
        <span aria-hidden="true">👤</span>
        <div>
          <strong>{recordName.trim() || "脂代谢研究所会员"}</strong>
          <p>营员代码：<span>{state.userCode}</span></p>
          <p>{email ?? (ready ? "当前设备尚未绑定邮箱" : "正在读取账号状态…")}</p>
        </div>
      </div>
      <div className="user-member-title">
        <strong>{memberTitle}</strong>
        <span>品牌会员称号，不代表科研或职业身份。</span>
      </div>
      <HealthStats records={records} recordedDays={stats.recordedDays} />
      <PersonalAssets
        state={state}
        records={records}
        recordName={recordName}
        endDate={stats.endDate}
        requiresMilestoneBinding={configured && !email && stats.elapsedDays >= 7}
      />
      <AccountSecurity configured={configured} email={email} />
      <SyncPanel />
      <Link className="user-center-checkin-link" to="/check-in">继续打卡</Link>
    </section>
  );
}
