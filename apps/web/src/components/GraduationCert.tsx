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
  const [error, setError] = useState("");
  const days = getLifetimeRecordedDays(state);
  const unlocked = canGraduate(state);

  const exportCertificate = () => {
    try {
      setCertificateUrl(createGraduationCertificate(state, recordName));
      setError("");
    } catch (caught) {
      setCertificateUrl("");
      setError(caught instanceof Error ? caught.message : "当前浏览器无法生成见证，请更换浏览器后重试。");
    }
  };

  return (
    <section className="graduation-cert" aria-labelledby="graduation-cert-title">
      <div className="graduation-cert-copy">
        <span>21-DAY METABOLIC RESET · WITNESSED</span>
        <h3 id="graduation-cert-title">21 天代谢重塑见证</h3>
        <p>按全部历史有效记录累计，允许非连续与跨期。本见证由你的真实打卡数据生成，仅纪念自我管理过程，不代表学历、职业资格、医疗或科研身份。</p>
        <button type="button" disabled={!unlocked} onClick={() => onRequest(exportCertificate)}>生成我的见证</button>
        <small>
          {unlocked
            ? `已累计记录 ${days} 天，可生成你的专属见证。`
            : `完成 ${GRADUATION_DAYS} 天累计打卡后，即可生成你的专属见证（当前进度 ${days}/${GRADUATION_DAYS}）`}
        </small>
        {error && <div className="bmi-toast" role="alert">{error}</div>}
      </div>
      {certificateUrl && (
        <div className="graduation-cert-preview">
          <img src={certificateUrl} alt="21 天代谢重塑见证预览" />
          <a href={certificateUrl} download="菌衡计划-21天代谢重塑见证.png">下载见证 PNG</a>
        </div>
      )}
    </section>
  );
}
