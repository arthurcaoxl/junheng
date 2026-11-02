import { getBmiTargetDiff } from "../../utils/bmi";
import { calculateTargetProgress } from "../../utils/metrics";

type BmiTargetGapProps = {
  currentWeightKg?: number;
  initialWeightKg?: number;
  heightCm?: string;
};

export function BmiTargetGap({ currentWeightKg, initialWeightKg, heightCm }: BmiTargetGapProps) {
  const target = getBmiTargetDiff(currentWeightKg, heightCm);
  if (!target) return null;
  const progress = target.status === "reduce"
    ? calculateTargetProgress(initialWeightKg, currentWeightKg, target.targetWeightKg)
    : null;

  return (
    <div className="bmi-target-gap" data-testid="bmi-target-gap" data-state={target.status}>
      {target.status === "underweight" ? (
        <span className="bmi-target-gap-copy">请注意营养补充，当前偏瘦</span>
      ) : (
        <span className="bmi-target-gap-copy">
          <span className="bmi-target-gap-label">
            {target.status === "reduce" ? "距离健康体重还需减脂" : "✅ 已处于健康体重范围"}
          </span>
          <strong className="bmi-target-gap-value">
            {target.status === "reduce"
              ? `${target.diffKg.toFixed(1)} kg`
              : `距超重上限还有 ${Math.abs(target.diffKg).toFixed(1)} kg`}
          </strong>
        </span>
      )}
      {progress !== null && (
        <div
          className="bmi-target-progress"
          role="progressbar"
          aria-label="目标进度"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span className="bmi-target-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
