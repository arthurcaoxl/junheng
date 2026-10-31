import { describe, expect, it } from "vitest";
import {
  clothesKg,
  deriveWeightCache,
  getRepresentativeWeight,
  netWeight,
  parseKg,
  representativeFromNodes,
} from "../utils/weight";

describe("parseKg / clothesKg", () => {
  it("accepts valid numbers and numeric strings", () => {
    expect(parseKg("64.8")).toBe(64.8);
    expect(parseKg(65)).toBe(65);
    expect(parseKg(" 64.8 ")).toBe(64.8);
  });

  it("rejects empty, non-numeric, zero and negative input", () => {
    expect(parseKg("")).toBeNull();
    expect(parseKg("   ")).toBeNull();
    expect(parseKg("abc")).toBeNull();
    expect(parseKg("64abc")).toBeNull();
    expect(parseKg("0")).toBeNull();
    expect(parseKg("-3")).toBeNull();
    expect(parseKg("NaN")).toBeNull();
    expect(parseKg("Infinity")).toBeNull();
    expect(parseKg(undefined)).toBeNull();
    expect(parseKg(null)).toBeNull();
  });

  it("clothes defaults to 0 and never presets a non-zero value", () => {
    expect(clothesKg(undefined)).toBe(0);
    expect(clothesKg("")).toBe(0);
    expect(clothesKg("abc")).toBe(0);
    expect(clothesKg("-1")).toBe(0);
    expect(clothesKg("0")).toBe(0);
    expect(clothesKg("0.8")).toBe(0.8);
  });
});

describe("netWeight", () => {
  it("subtracts clothes and defaults clothes to 0", () => {
    expect(netWeight("64.8", "0.8")).toBeCloseTo(64);
    expect(netWeight("64.8", undefined)).toBe(64.8);
    expect(netWeight("64.8", "")).toBe(64.8);
  });

  it("rejects invalid scale and implausible net below 20kg", () => {
    expect(netWeight("", "0.8")).toBeNull();
    expect(netWeight("abc", "0.8")).toBeNull();
    expect(netWeight("0.5", "0.8")).toBeNull(); // 净重为负
    expect(netWeight("20.7", "0.8")).toBeNull(); // 19.9 < 20
    expect(netWeight("20.8", "0.8")).toBe(20);
  });
});

describe("representativeFromNodes 权重分配", () => {
  it("早60/中20/晚20 全节点", () => {
    const result = representativeFromNodes({ morning: "60", noon: "62", evening: "63" }, "0");
    // 60*0.6 + 62*0.2 + 63*0.2 = 36 + 12.4 + 12.6 = 61
    expect(result.value).toBe(61);
    expect(result.used).toEqual([
      { node: "morning", ratio: 0.6 },
      { node: "noon", ratio: 0.2 },
      { node: "evening", ratio: 0.2 },
    ]);
    expect(result.nonFastingOnly).toBe(false);
  });

  it("早+中 → 75/25；早+晚 → 75/25", () => {
    expect(representativeFromNodes({ morning: "60", noon: "64" }, "0").value).toBe(61); // 60*.75+64*.25
    expect(representativeFromNodes({ morning: "60", evening: "64" }, "0").value).toBe(61);
  });

  it("中+晚 → 50/50，且标记非空腹", () => {
    const result = representativeFromNodes({ noon: "62", evening: "64" }, "0");
    expect(result.value).toBe(63);
    expect(result.used).toEqual([
      { node: "noon", ratio: 0.5 },
      { node: "evening", ratio: 0.5 },
    ]);
    expect(result.nonFastingOnly).toBe(true);
  });

  it("单节点直接取净重；仅晚间也标记非空腹", () => {
    expect(representativeFromNodes({ morning: "60" }, "0").value).toBe(60);
    const eveningOnly = representativeFromNodes({ evening: "63" }, "0");
    expect(eveningOnly.value).toBe(63);
    expect(eveningOnly.nonFastingOnly).toBe(true);
  });

  it("所有节点先扣衣物再加权", () => {
    const result = representativeFromNodes({ morning: "60.8", evening: "62.8" }, "0.8");
    // 净重 60 与 62 → 60*.75 + 62*.25 = 60.5
    expect(result.value).toBe(60.5);
  });

  it("异常节点被剔除后按剩余节点重归一化", () => {
    const result = representativeFromNodes({ morning: "60", noon: "abc", evening: "" }, "0");
    expect(result.value).toBe(60);
    expect(result.used).toEqual([{ node: "morning", ratio: 1 }]);
  });

  it("净重低于 20kg 的节点不参与计算", () => {
    const result = representativeFromNodes({ morning: "19", evening: "63" }, "0");
    expect(result.value).toBe(63);
  });

  it("全部无效时返回 null 且 used 为空", () => {
    expect(representativeFromNodes({}, "0").value).toBeNull();
    expect(representativeFromNodes(undefined, "0").value).toBeNull();
    expect(representativeFromNodes({ morning: "abc" }, "0").used).toEqual([]);
  });

  it("结果保留 1 位小数", () => {
    // 60.05*0.6 + 62.15*0.2 + 63.25*0.2 = 36.03+12.43+12.65 = 61.11 → 61.1
    const result = representativeFromNodes({ morning: "60.05", noon: "62.15", evening: "63.25" }, "0");
    expect(result.value).toBe(61.1);
  });
});

describe("getRepresentativeWeight 统一读取", () => {
  it("旧数据只有 weight：原样返回（视为早晨、衣物 0）", () => {
    expect(getRepresentativeWeight({ weight: "65" })).toBe("65");
    expect(getRepresentativeWeight({ weight: "65.2" })).toBe("65.2");
  });

  it("weights 有效时忽略 weight 缓存", () => {
    expect(getRepresentativeWeight({ weight: "99", weights: { morning: "60.8" }, clothes: "0.8" })).toBe("60");
  });

  it("weights 损坏或全无效时回退 weight", () => {
    expect(getRepresentativeWeight({ weight: "65", weights: {} })).toBe("65");
    expect(getRepresentativeWeight({ weight: "65", weights: { morning: "abc" } })).toBe("65");
  });

  it("无数据返回空字符串", () => {
    expect(getRepresentativeWeight(undefined)).toBe("");
    expect(getRepresentativeWeight({})).toBe("");
    expect(getRepresentativeWeight({ weight: "" })).toBe("");
    expect(getRepresentativeWeight({ weight: "abc" })).toBe("");
  });
});

describe("deriveWeightCache 双写", () => {
  it("有 weights 时重算缓存", () => {
    expect(deriveWeightCache({ weight: "65", weights: { morning: "60", evening: "64" }, clothes: "0" })).toBe("61");
  });

  it("无有效节点时保留原 weight", () => {
    expect(deriveWeightCache({ weight: "65", weights: {} })).toBe("65");
    expect(deriveWeightCache({})).toBe("");
  });
});
