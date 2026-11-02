import { useState } from "react";
import { Link } from "react-router";

type ConsentDialogProps = {
  busy?: boolean;
  onAgree: () => void;
  onDecline: () => void;
};

/**
 * 用户数据合规总授权弹窗（挂在打卡入口点击处）：
 * 默认不勾选；同意与“暂不参与”都会留下云端表态并放行，之后绝不重复弹窗。
 */
export function ConsentDialog({ busy = false, onAgree, onDecline }: ConsentDialogProps) {
  const [checked, setChecked] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);

  return (
    <div className="consent-overlay">
      <div className="consent-dialog" role="dialog" aria-modal="true" aria-label="开启前，请确认数据授权">
        <p className="consent-eyebrow">DATA CONSENT · 数据合规授权</p>
        <h2>开启前，请确认数据授权</h2>
        <p className="consent-intro">你的健康记录只属于你。以下授权仅用于匿名统计与产品改进。</p>

        <label className="consent-checkbox-row">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => {
              setChecked(event.target.checked);
              if (event.target.checked) setHintVisible(false);
            }}
          />
          <span>☑️ 我同意参与平台真实数据研究（数据将脱敏处理，仅用于行业趋势分析，绝不泄露个人隐私）。</span>
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
            onClick={onAgree}
          >
            {busy ? "正在确认…" : "同意并开启打卡"}
          </button>
        </div>
        <button type="button" className="consent-secondary" onClick={onDecline} disabled={busy}>
          暂不参与
        </button>
        {hintVisible && !checked && <p className="consent-hint" role="alert">请先勾选同意</p>}
      </div>
    </div>
  );
}
