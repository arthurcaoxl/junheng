import { BMI_SCALE_MAX, BMI_SCALE_MIN, getBmiScalePosition, roundBmi } from "../../utils/bmi";

const SEGMENTS = [
  { key: "underweight", label: "体重过低", range: "< 18.5", from: 14, to: 18.5 },
  { key: "normal", label: "体重正常", range: "18.5–23.9", from: 18.5, to: 24 },
  { key: "overweight", label: "超重", range: "24.0–27.9", from: 24, to: 28 },
  { key: "obese", label: "肥胖", range: "≥ 28.0", from: 28, to: 35 },
] as const;

export function BmiScale({ bmi }: { bmi: number }) {
  const position = getBmiScalePosition(bmi);
  return (
    <div className="bmi-scale" role="img" aria-label={`BMI 分类量尺，当前 ${roundBmi(bmi).toFixed(1)}`}>
      <div className="bmi-scale-visual">
        <div className="bmi-scale-indicator" data-testid="bmi-scale-indicator" style={{ left: `${position}%` }}>
          <strong>{roundBmi(bmi).toFixed(1)}</strong>
          <span aria-hidden="true" />
        </div>
        <div className="bmi-scale-band">
          {SEGMENTS.map((segment) => (
            <span
              key={segment.key}
              className={`bmi-scale-segment bmi-scale-${segment.key}`}
              style={{ width: `${((segment.to - segment.from) / (BMI_SCALE_MAX - BMI_SCALE_MIN)) * 100}%` }}
            />
          ))}
        </div>
      </div>
      <div className="bmi-scale-legend" aria-hidden="true">
        {SEGMENTS.map((segment) => (
          <div key={segment.key} style={{ width: `${((segment.to - segment.from) / (BMI_SCALE_MAX - BMI_SCALE_MIN)) * 100}%` }}>
            <span>{segment.label}</span>
            <small>{segment.range}</small>
          </div>
        ))}
      </div>
      <div className="bmi-scale-extents" aria-hidden="true"><span>{BMI_SCALE_MIN}</span><span>{BMI_SCALE_MAX}</span></div>
    </div>
  );
}
