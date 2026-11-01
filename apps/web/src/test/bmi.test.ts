import { describe, expect, it } from "vitest";
import {
  BMI_SCALE_MAX,
  BMI_SCALE_MIN,
  calculateBmi,
  classifyBmi,
  getBmiScalePosition,
  getBmiTracking,
  roundBmi,
  type BmiTrackingInput,
} from "../utils/bmi";

function trackingInput(overrides: Partial<BmiTrackingInput> = {}): BmiTrackingInput {
  return {
    startDate: "2026-11-01",
    heightCm: "175",
    records: {},
    ...overrides,
  };
}

describe("calculateBmi", () => {
  it("按 kg / m² 计算并保留原始精度", () => {
    const result = calculateBmi("70", "175");
    expect(result).toBeCloseTo(70 / (1.75 * 1.75), 12);
    expect(result).not.toBe(22.9);
  });

  it("支持数字与带空格的数值字符串", () => {
    expect(calculateBmi(70, " 175 ")).toBeCloseTo(22.8571428571, 8);
  });

  it.each([
    ["", "175"],
    ["abc", "175"],
    ["0", "175"],
    ["-70", "175"],
    ["70", ""],
    ["70", "abc"],
    ["70", "0"],
    ["70", "-175"],
    ["Infinity", "175"],
    ["70", "NaN"],
  ])("非法输入 %s / %s 返回 null", (weight, height) => {
    expect(calculateBmi(weight, height)).toBeNull();
  });
});

describe("classifyBmi / roundBmi", () => {
  it.each([
    [18.49, "underweight"],
    [18.5, "normal"],
    [23.99, "normal"],
    [24, "overweight"],
    [27.99, "overweight"],
    [28, "obese"],
  ] as const)("BMI %s 分类为 %s", (bmi, category) => {
    expect(classifyBmi(bmi)).toBe(category);
  });

  it("分类使用原始值，而不是四舍五入后的展示值", () => {
    expect(roundBmi(23.96)).toBe(24);
    expect(classifyBmi(23.96)).toBe("normal");
  });

  it("非有限数值无法分类", () => {
    expect(classifyBmi(Number.NaN)).toBeNull();
    expect(classifyBmi(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("展示值保留 1 位并归一化 -0", () => {
    expect(roundBmi(22.85)).toBe(22.9);
    expect(roundBmi(-0.04)).toBe(0);
    expect(Object.is(roundBmi(-0.04), -0)).toBe(false);
  });
});

describe("getBmiScalePosition", () => {
  it("将 14–35 映射到 0–100%", () => {
    expect(BMI_SCALE_MIN).toBe(14);
    expect(BMI_SCALE_MAX).toBe(35);
    expect(getBmiScalePosition(14)).toBe(0);
    expect(getBmiScalePosition(24.5)).toBe(50);
    expect(getBmiScalePosition(35)).toBe(100);
  });

  it("超出量尺的数值截断到两端", () => {
    expect(getBmiScalePosition(10)).toBe(0);
    expect(getBmiScalePosition(40)).toBe(100);
  });
});

describe("getBmiTracking", () => {
  it("初始值取 D1，当前值取窗口内最晚有效体重", () => {
    const result = getBmiTracking(trackingInput({
      records: {
        "2026-11-03": { weight: "68" },
        "2026-11-01": { weight: "70" },
        "2026-11-02": { weight: "69" },
      },
    }));

    expect(result.initial).toMatchObject({ date: "2026-11-01", weightKg: 70 });
    expect(result.current).toMatchObject({ date: "2026-11-03", weightKg: 68 });
    expect(result.series.map((point) => point.date)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
    expect(result.change).toBeCloseTo(result.current!.bmi - result.initial!.bmi, 12);
  });

  it("D1 无有效体重时回退到窗口内最早有效体重", () => {
    const result = getBmiTracking(trackingInput({
      records: {
        "2026-11-01": { weight: "" },
        "2026-11-03": { weight: "69" },
        "2026-11-05": { weight: "68" },
      },
    }));

    expect(result.initial).toMatchObject({ date: "2026-11-03", weightKg: 69 });
    expect(result.current).toMatchObject({ date: "2026-11-05", weightKg: 68 });
  });

  it("自定义初始体重优先于 D1，且不插入每日趋势", () => {
    const result = getBmiTracking(trackingInput({
      initialWeightKg: "72",
      records: {
        "2026-11-01": { weight: "70" },
        "2026-11-02": { weight: "69" },
      },
    }));

    expect(result.initial).toEqual({
      date: null,
      weightKg: 72,
      bmi: calculateBmi("72", "175"),
    });
    expect(result.series).toHaveLength(2);
  });

  it("每日体重统一读取多节点代表值并忽略旧缓存", () => {
    const result = getBmiTracking(trackingInput({
      records: {
        "2026-11-01": {
          weight: "99",
          weights: { morning: "70.8", evening: "72.8" },
          clothes: "0.8",
        },
      },
    }));

    // 早晨净重 70，晚间 72.8，按 75/25 归一化后代表体重为 70.7。
    expect(result.current).toMatchObject({ weightKg: 70.7 });
    expect(result.current!.bmi).toBeCloseTo(calculateBmi("70.7", "175")!, 12);
  });

  it("忽略窗口外记录和无有效体重的日期", () => {
    const result = getBmiTracking(trackingInput({
      records: {
        "2026-10-31": { weight: "80" },
        "2026-11-01": { weight: "abc" },
        "2026-11-02": { weight: "70", water: true },
        "2026-11-22": { weight: "60" },
      },
    }));

    expect(result.series.map((point) => point.date)).toEqual(["2026-11-02"]);
    expect(result.initial).toEqual(result.current);
    expect(result.change).toBe(0);
  });

  it("自定义初始值存在但无每日体重时，当前值和变化量为空", () => {
    const result = getBmiTracking(trackingInput({ initialWeightKg: "72" }));

    expect(result.initial).toMatchObject({ weightKg: 72, date: null });
    expect(result.current).toBeNull();
    expect(result.change).toBeNull();
    expect(result.series).toEqual([]);
  });

  it("身高缺失或非法时不生成 BMI 结果", () => {
    const records = { "2026-11-01": { weight: "70" } };
    for (const heightCm of [undefined, "", "abc", "0", "-175"]) {
      const result = getBmiTracking(trackingInput({ heightCm, records }));
      expect(result).toEqual({ initial: null, current: null, change: null, series: [] });
    }
  });

  it("微小负变化展示时归一化为 0，而不是 -0", () => {
    const result = getBmiTracking(trackingInput({
      heightCm: "200",
      records: {
        "2026-11-01": { weight: "70" },
        "2026-11-02": { weight: "69.99" },
      },
    }));

    expect(result.change).toBeLessThan(0);
    expect(roundBmi(result.change!)).toBe(0);
    expect(Object.is(roundBmi(result.change!), -0)).toBe(false);
  });
});
