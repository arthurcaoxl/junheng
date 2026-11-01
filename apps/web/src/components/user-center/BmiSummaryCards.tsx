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
  const currentCategory = tracking.current ? classifyBmi(tracking.current.bmi) : null;
  const roundedChange = tracking.change === null ? null : roundBmi(tracking.change);
  const changeLabel = roundedChange === null
    ? "—"
    : `${roundedChange > 0 ? "+" : ""}${roundedChange.toFixed(1)}`;

  return (
    <div className="bmi-summary-cards">
      <article>
        <span>当前 BMI</span>
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
  );
}
