import { useState } from "react";
import type { CheckInState } from "../utils/checkin";
import { canGraduate, createGraduationCertificate, getLifetimeRecordedDays, GRADUATION_DAYS } from "../utils/graduationCertificate";

type GraduationCertProps = {
  state: CheckInState;
  recordName: string;
  onRequest: (action: () => void) => void;
};

export function GraduationCert({ state, recordName, onRequest }: GraduationCertProps) {
  const [certificateUrl, setCertificateUrl] = useState("");
  const [error, setError] = useState(false);
  const days = getLifetimeRecordedDays(state);
  const unlocked = canGraduate(state);

  const exportCertificate = () => {
    try {
      setCertificateUrl(createGraduationCertificate(state, recordName));
      setError(false);
    } catch {
      setError(true);
    }
  };

  return (
    <section className="graduation-cert" aria-labelledby="graduation-cert-title">
      <div className="graduation-cert-copy">
        <span>MEMBER GROWTH KEEPSAKE</span>
        <h3 id="graduation-cert-title">21 天会员结业纪念证书</h3>
        <p>按全部历史有效记录累计，允许非连续与跨期。证书仅纪念会员的自我管理过程，不代表学历、职业资格或科研身份。</p>
        <button type="button" disabled={!unlocked} onClick={() => onRequest(exportCertificate)}>生成结业证书</button>
        <small>
          {unlocked
            ? `已累计记录 ${days} 天，可生成专属会员成长纪念证书。`
            : `完成 ${GRADUATION_DAYS} 天累计打卡后可解锁专属结业证书（当前进度 ${days}/${GRADUATION_DAYS}）`}
        </small>
        {error && <p role="alert">当前浏览器无法生成结业证书，请更换浏览器后重试。</p>}
      </div>
      {certificateUrl && (
        <div className="graduation-cert-preview">
          <img src={certificateUrl} alt="21 天会员结业纪念证书预览" />
          <a href={certificateUrl} download="菌衡计划-21天会员结业纪念证书.png">下载结业证书 PNG</a>
        </div>
      )}
    </section>
  );
}
