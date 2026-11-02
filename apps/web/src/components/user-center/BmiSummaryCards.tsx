import { useState } from "react";
import { classifyBmi, roundBmi, type BmiTrackingResult } from "../../utils/bmi";

const CATEGORY_LABELS = {
  underweight: "体重过低",
  normal: "体重正常",
  overweight: "超重",
  obese: "肥胖",
} as const;

function display(value: number | null) {
  return value === null ? "—" : roundBmi(value).toFixed(1);
}

export function BmiSummaryCards({ tracking, customizedInitial }: { tracking: BmiTrackingResult; customizedInitial: boolean }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const currentCategory = tracking.current ? classifyBmi(tracking.current.bmi) : null;
  const roundedChange = tracking.change === null ? null : roundBmi(tracking.change);
  const changeLabel = roundedChange === null
    ? "—"
    : `${roundedChange > 0 ? "+" : ""}${roundedChange.toFixed(1)}`;

  return (
    <>
      <div className="bmi-summary-cards">
        <article>
          <span className="bmi-summary-label">
            当前 BMI
            <button type="button" className="bmi-info-trigger" aria-label="BMI 适用性说明" onClick={() => setInfoOpen(true)}>?</button>
          </span>
          <strong data-testid="bmi-current">{display(tracking.current?.bmi ?? null)}</strong>
          <small>{currentCategory ? CATEGORY_LABELS[currentCategory] : "等待有效体重"}</small>
        </article>
        <article>
          <span>初始 BMI</span>
          <strong data-testid="bmi-initial">{display(tracking.initial?.bmi ?? null)}</strong>
          <small>{customizedInitial ? "自定义初始体重" : "基于首条记录"}</small>
        </article>
        <article>
          <span>BMI 变化</span>
          <strong data-testid="bmi-change">{changeLabel}</strong>
          <small>较首条记录</small>
        </article>
      </div>
      {infoOpen && (
        <div className="bmi-info-overlay" onClick={() => setInfoOpen(false)}>
          <section className="bmi-info-dialog" role="dialog" aria-modal="true" aria-label="BMI 适用性说明" onClick={(event) => event.stopPropagation()}>
            <span className="bmi-info-eyebrow">ABOUT BMI</span>
            <h3>理解数字，也理解它的边界</h3>
            <p>BMI 是体重与身高的比值，无法区分脂肪与肌肉。肌肉量较高的人群即使 BMI 偏高，也不一定代表肥胖；请结合腰围、体能与长期趋势综合观察。</p>
            <button type="button" className="bmi-primary-button" onClick={() => setInfoOpen(false)}>我知道了</button>
          </section>
        </div>
      )}
    </>
  );
}
