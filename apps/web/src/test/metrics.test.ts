import { describe, expect, it } from "vitest";
import {
  calculate7DayMovingAverage,
  calculateTargetProgress,
  getSmartFeedback,
} from "../utils/metrics";

describe("calculateTargetProgress", () => {
  it("初 70、现 68、目标 65 → 40%", () => {
    expect(calculateTargetProgress(70, 68, 65)).toBe(40);
  });

  it("已越过目标截断为 100，体重反弹截断为 0", () => {
    expect(calculateTargetProgress(70, 64, 65)).toBe(100);
    expect(calculateTargetProgress(70, 72, 65)).toBe(0);
  });

  it("初始等于目标或非法输入返回 null", () => {
    expect(calculateTargetProgress(65, 64, 65)).toBeNull();
    expect(calculateTargetProgress(0, 68, 65)).toBeNull();
    expect(calculateTargetProgress(70, Number.NaN, 65)).toBeNull();
  });
});

describe("calculate7DayMovingAverage", () => {
  it("窗口自适应：不足 7 天按可用天数，满 7 天后滚动取值", () => {
    const weights = [70, 69.8, 69.6, 69.5, 69.3, 69.2, 69, 68.8];
    const points = weights.map((weightKg, index) => ({
      date: `2026-11-${String(index + 1).padStart(2, "0")}`,
      weightKg,
    }));
    const result = calculate7DayMovingAverage(points);
    expect(result).toHaveLength(8);
    expect(result[0].ma7).toBeCloseTo(70, 1);
    expect(result[5].ma7).toBeCloseTo((70 + 69.8 + 69.6 + 69.5 + 69.3 + 69.2) / 6, 1);
    expect(result[6].ma7).toBeCloseTo((70 + 69.8 + 69.6 + 69.5 + 69.3 + 69.2 + 69) / 7, 1);
    expect(result[7].ma7).toBeCloseTo((69.8 + 69.6 + 69.5 + 69.3 + 69.2 + 69 + 68.8) / 7, 1);
  });

  it("空数组返回空数组", () => {
    expect(calculate7DayMovingAverage([])).toEqual([]);
  });
});

describe("getSmartFeedback", () => {
  function records(weights: number[], waists: (number | null)[]) {
    return Object.fromEntries(weights.map((weight, index) => [
      `2026-11-${String(index + 1).padStart(2, "0")}`,
      { weight: String(weight), waist: waists[index] == null ? "" : String(waists[index]) },
    ]));
  }

  it("近 7 天体重 -0.3kg、腰围 -1.5cm 双降 → 精准掉脂肪", () => {
    const feedback = getSmartFeedback(records(
      [70, 69.9, 69.8, 69.7, 69.6, 69.7, 69.7],
      [96, 95.7, 95.3, 95, 94.8, 94.6, 94.5],
    ));
    expect(feedback).toContain("精准掉脂肪");
  });

  it("体重回升 → 水分波动安抚，不制造焦虑", () => {
    const feedback = getSmartFeedback(records(
      [68, 68.1, 68.2, 68.3, 68.4, 68.5, 68.6],
      [90, 90, 90, 90, 90, 90, 90],
    ));
    expect(feedback).toContain("水分");
  });

  it("体重腰围双双持平 → 平台期安抚", () => {
    const feedback = getSmartFeedback(records(
      [68, 68, 68.1, 68, 68, 68.1, 68],
      [90, 90.1, 90, 90, 90.1, 90, 90],
    ));
    expect(feedback).toContain("平台期");
  });

  it("数据不足两条有效体重时返回 null", () => {
    expect(getSmartFeedback({})).toBeNull();
    expect(getSmartFeedback(records([70], [null]))).toBeNull();
  });
});
