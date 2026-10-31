import { Link } from "react-router";
import { useSyncStatus } from "../hooks/useSyncStatus";

/** 用户中心落地页：先承载账号状态，后续可迁入趋势、海报等个人资产。 */
export default function UserCenter() {
  const { email, ready } = useSyncStatus();

  return (
    <section className="user-center section-pad" data-theme="forest" aria-labelledby="user-center-title">
      <p className="eyebrow">PERSONAL HEALTH RECORD</p>
      <h1 id="user-center-title">用户中心</h1>
      <div className="user-center-account">
        <span aria-hidden="true">👤</span>
        <div>
          <strong>{email ?? (ready ? "当前设备尚未绑定邮箱" : "正在读取账号状态…")}</strong>
          {email && <p>打卡记录会自动备份到云端，换手机或电脑可凭此邮箱恢复。</p>}
        </div>
      </div>
      <Link className="user-center-checkin-link" to="/check-in">继续打卡</Link>
    </section>
  );
}
