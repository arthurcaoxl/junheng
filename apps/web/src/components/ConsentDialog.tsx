import { useState } from "react";
import { Link } from "react-router";
import { grantResearchConsent } from "../services/checkinSync";
import { CONSENT_STORAGE_KEY } from "../utils/consent";

type ConsentDialogProps = {
  onGranted: () => void;
};

/** 数据合规授权弹窗：勾选同意 + 协议超链接的行业标准形态，默认不勾选（自愿、明确同意）。 */
export function ConsentDialog({ onGranted }: ConsentDialogProps) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);

  const submit = async () => {
    if (!checked || busy) return;
    setBusy(true);
    try {
      // 云端失败不阻断：本地优先，授权留痕以本机为准，云端尽力同步
      await grantResearchConsent().catch((error: unknown) => {
        console.warn("授权状态云端同步失败，已保留本机授权记录。", error);
      });
      window.localStorage.setItem(CONSENT_STORAGE_KEY, "true");
      onGranted();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="consent-overlay">
      <div className="consent-dialog" role="dialog" aria-modal="true" aria-label="数据使用授权">
        <p className="consent-eyebrow">DATA CONSENT · 数据使用授权</p>
        <h2>开始前，请确认数据授权</h2>
        <p className="consent-intro">你的健康记录只属于你。以下授权仅用于匿名统计与产品改进，随时可在用户中心查看或修改数据。</p>

        <label className="consent-checkbox-row">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => {
              setChecked(event.target.checked);
              if (event.target.checked) setHintVisible(false);
            }}
          />
          <span>我同意平台在脱敏前提下，将我的健康数据用于产品优化与代谢研究。</span>
        </label>

        <p className="consent-agreement">
          我已阅读并同意<Link to="/terms">《用户服务协议》</Link>与<Link to="/privacy">《隐私政策》</Link>
        </p>

        {/* 未勾选时点击提示：disabled 按钮不触发 click，由外层容器捕获 */}
        <div
          onPointerDown={() => { if (!checked) setHintVisible(true); }}
          onClick={() => { if (!checked) setHintVisible(true); }}
        >
          <button
            type="button"
            className="consent-primary"
            disabled={!checked || busy}
            onClick={submit}
          >
            {busy ? "正在确认…" : "同意并开启打卡"}
          </button>
        </div>
        {hintVisible && !checked && <p className="consent-hint" role="alert">请先勾选同意</p>}
      </div>
    </div>
  );
}
