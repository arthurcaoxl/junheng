import { beforeEach, describe, expect, it } from "vitest";
import { exportCheckInCsv, hasContent, loadState, STORAGE_KEY } from "../utils/checkin";

describe("storage-v3 多节点桥接", () => {
  beforeEach(() => window.localStorage.clear());

  it("loadState 放行 weights / clothes / clothesWeight 并忽略损坏节点", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      schema: 3,
      userCode: "JH-AB2CD",
      startDate: "2026-10-01",
      clothesWeight: "0.8",
      records: {
        "2026-10-01": {
          weight: "61",
          waist: "72",
          meals: [true, false, false],
          water: true,
          movement: false,
          sleep: true,
          weights: { morning: "60.8", evening: "62.8", noon: 123 },
          clothes: "0.8",
        },
      },
    }));
    const state = loadState();
    expect(state.clothesWeight).toBe("0.8");
    const day = state.records["2026-10-01"];
    expect(day.weights).toEqual({ morning: "60.8", evening: "62.8" }); // 非字符串节点被剔除
    expect(day.clothes).toBe("0.8");
    expect(day.weight).toBe("61"); // 缓存原样保留，由写入方负责重算
  });

  it("旧数据没有扩展字段时保持缺省", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      schema: 3,
      userCode: "JH-AB2CD",
      startDate: "2026-10-01",
      records: { "2026-10-01": { weight: "65", waist: "", meals: [false, false, false], water: false, movement: false, sleep: false } },
    }));
    const state = loadState();
    expect(state.clothesWeight).toBeUndefined();
    expect(state.records["2026-10-01"].weights).toBeUndefined();
    expect(state.records["2026-10-01"].clothes).toBeUndefined();
  });

  it("已有 userCode 时 loadState 绝不重新生成（终身唯一营销码）", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      schema: 3,
      userCode: "JH-FIXED",
      startDate: "2026-10-01",
      records: {},
    }));
    // 即使存在旧版键，也不走迁移、不换代码
    window.localStorage.setItem("junheng-checkin-v2", JSON.stringify([{ weight: "60" }]));
    const first = loadState();
    const second = loadState();
    expect(first.userCode).toBe("JH-FIXED");
    expect(second.userCode).toBe("JH-FIXED");
  });

  it("hasContent 认可仅有多节点体重的记录", () => {
    expect(hasContent({ weight: "", waist: "", meals: [false, false, false], water: false, movement: false, sleep: false, weights: { evening: "63" } })).toBe(true);
    expect(hasContent({ weight: "", waist: "", meals: [false, false, false], water: false, movement: false, sleep: false, weights: {} })).toBe(false);
  });

  it("CSV 的 weight_kg 列输出综合代表体重，旧数据列语义不变", () => {
    const csv = exportCheckInCsv({
      schema: 3,
      userCode: "JH-AB2CD",
      startDate: "2026-10-01",
      records: {
        "2026-10-01": { weight: "65", waist: "", meals: [false, false, false], water: false, movement: false, sleep: false },
        "2026-10-02": { weight: "99", waist: "", meals: [false, false, false], water: false, movement: false, sleep: false, weights: { morning: "60.8", evening: "62.8" }, clothes: "0.8" },
      },
    });
    const lines = csv.trim().split("\n");
    expect(lines[1]).toContain("65"); // 旧数据原值
    expect(lines[2]).toContain("60.5"); // 净重 60/62 按 75/25 加权
    expect(lines[2]).not.toContain("99"); // 派生缓存不被采用
  });
});
