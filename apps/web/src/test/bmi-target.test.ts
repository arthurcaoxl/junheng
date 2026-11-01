import { describe, expect, it } from "vitest";
import { getBmiTargetDiff } from "../utils/bmi";

describe("getBmiTargetDiff", () => {
  it("超重：目标体重先保留 1 位，再返回需减重的正差值", () => {
    // 24 × 1.63² = 63.7656 → 63.8；70 - 63.8 = 6.2。
    expect(getBmiTargetDiff("70", "163")).toEqual({
      status: "reduce",
      targetWeightKg: 63.8,
      diffKg: 6.2,
    });
  });

  it("正常：返回距离超重阈值的负差值，供 UI 展示安全空间", () => {
    expect(getBmiTargetDiff("68", "175")).toEqual({
      status: "safe",
      targetWeightKg: 73.5,
      diffKg: -5.5,
    });
  });

  it("偏瘦：返回偏瘦状态，不构造减重提示", () => {
    expect(getBmiTargetDiff("50", "175")).toEqual({
      status: "underweight",
      targetWeightKg: 73.5,
      diffKg: -23.5,
    });
  });

  it("无身高、无体重或输入非法时返回 null", () => {
    expect(getBmiTargetDiff(undefined, "175")).toBeNull();
    expect(getBmiTargetDiff("70", undefined)).toBeNull();
    expect(getBmiTargetDiff("", "175")).toBeNull();
    expect(getBmiTargetDiff("70", "")).toBeNull();
    expect(getBmiTargetDiff("abc", "175")).toBeNull();
    expect(getBmiTargetDiff("70", "abc")).toBeNull();
    expect(getBmiTargetDiff("0", "175")).toBeNull();
    expect(getBmiTargetDiff("70", "0")).toBeNull();
  });
});
