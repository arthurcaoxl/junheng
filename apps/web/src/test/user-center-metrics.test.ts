import { describe, expect, it } from "vitest";
import type { DayRecord } from "../types/checkin";
import { getPeriodWeightChange } from "../utils/userCenter";

function day(weight = ""): DayRecord {
  return { weight, waist: "", meals: [false, false, false], water: false, movement: false, sleep: false };
}

describe("用户中心体重指标", () => {
  it("用最近有效体重减首个有效体重，负值表示下降", () => {
    expect(getPeriodWeightChange([day("70"), day("69.4")])).toBeCloseTo(-0.6);
  });

  it("保留体重上升的正变化方向", () => {
    expect(getPeriodWeightChange([day("69.4"), day("70")])).toBeCloseTo(0.6);
  });

  it("少于两条有效体重记录时不计算变化", () => {
    expect(getPeriodWeightChange([day("70")])).toBeNull();
    expect(getPeriodWeightChange([day(), day("not-a-number")])).toBeNull();
  });

  it("跳过空值和无效值，不补造趋势数据", () => {
    expect(getPeriodWeightChange([day("70"), day(), day("invalid"), day("68.9")])).toBeCloseTo(-1.1);
  });
});
