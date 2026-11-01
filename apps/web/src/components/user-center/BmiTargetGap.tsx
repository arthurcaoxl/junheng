import { getBmiTargetDiff } from "../../utils/bmi";

type BmiTargetGapProps = {
  currentWeightKg?: number;
  heightCm?: string;
};

export function BmiTargetGap({ currentWeightKg, heightCm }: BmiTargetGapProps) {
  const target = getBmiTargetDiff(currentWeightKg, heightCm);
  if (!target) return null;

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
    </div>
  );
}
