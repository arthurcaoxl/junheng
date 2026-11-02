import { describe, expect, it } from "vitest";
import { emptyDay } from "../utils/checkin";
import { buildWitnessSummary, getWitnessVariant } from "../utils/witness";

type Measurement = {
  weight: string;
  waist: string;
};

function recordsBetween(first: Measurement, latest: Measurement) {
  return {
    "2026-01-01": { ...emptyDay(), ...first },
    "2026-01-21": { ...emptyDay(), ...latest },
  };
}

describe("21 天代谢重塑见证分牌", () => {
  it("体重减少 0.5kg、腰围不变时生成奖励牌", () => {
    const records = recordsBetween(
      { weight: "70.5", waist: "80" },
      { weight: "70", waist: "80" },
    );

    expect(getWitnessVariant(records)).toBe("reward");
  });

  it("体重增加但腰围缩减 2cm 时仍生成奖励牌", () => {
    const records = recordsBetween(
      { weight: "70", waist: "82" },
      { weight: "71", waist: "80" },
    );

    expect(getWitnessVariant(records)).toBe("reward");
  });

  it("体重增加且腰围仅缩减 0.5cm 时生成鼓励牌", () => {
    const records = recordsBetween(
      { weight: "70", waist: "80.5" },
      { weight: "71", waist: "80" },
    );

    expect(getWitnessVariant(records)).toBe("encouragement");
  });
});

describe("21 天代谢重塑见证摘要", () => {
  it("鼓励牌摘要不包含体重变化字段", () => {
    const records = recordsBetween(
      { weight: "70", waist: "80.5" },
      { weight: "71", waist: "80" },
    );

    const summary = buildWitnessSummary(records);

    expect(summary.weightDelta).toBeUndefined();
    expect(summary.waistDelta).toBe(0.5);
  });

  it("腰围增加时将腰围变化置为 null，绝不输出负值", () => {
    const records = recordsBetween(
      { weight: "70", waist: "79" },
      { weight: "71", waist: "80" },
    );

    const summary = buildWitnessSummary(records);

    expect(summary.waistDelta).toBeNull();
  });

  it("奖励牌也只保留正向体重差值", () => {
    const records = recordsBetween(
      { weight: "70", waist: "82" },
      { weight: "71", waist: "80" },
    );

    const summary = buildWitnessSummary(records);

    expect(summary.weightDelta).toBeNull();
    expect(summary.waistDelta).toBe(2);
  });

  it("没有任何有效身体测量值时标记为无数据", () => {
    const summary = buildWitnessSummary({});

    expect(summary.hasMeasurements).toBe(false);
    expect(summary.waistDelta).toBeNull();
  });
});
