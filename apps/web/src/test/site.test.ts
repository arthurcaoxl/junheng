import { describe, expect, it } from "vitest";
import { actionConfig, siteConfig } from "../config/site";
import type { MealCheckIn, WaistRecord, WeightRecord } from "../types/check-in";

describe("brand configuration", () => {
  it("keeps the approved slogan verbatim", () => {
    expect(siteConfig.slogan).toBe("餐前伴侣助力脂代谢");
    expect(siteConfig.healthStatement).toBe("健康体重管理");
    expect(siteConfig.subtitle).toBe("——23种菌菇精华 × 优质蛋白 × 复合维生素——");
  });

  it("defines the approved internal research-platform identity and boundary", () => {
    expect(siteConfig.headerBrand).toBe("菌衡计划 | 脂代谢研究所");
    expect(siteConfig.platform).toBe("菌衡计划·脂代谢研究所");
    expect(siteConfig.platformEnglish).toBe("FUNGIBLEND LIPID METABOLISM RESEARCH INSTITUTE");
    expect(siteConfig.platformDisclaimer).toBe("注：菌衡计划·脂代谢研究所为本品牌内部健康管理研究平台，非医疗或国家级学术机构。相关数据与成分科普不作为医疗诊断或治疗依据。");
  });

  it("keeps all future conversion entries disabled", () => {
    expect(actionConfig.consultation.enabled).toBe(false);
    expect(actionConfig.purchase.enabled).toBe(false);
    expect(actionConfig.consultation.url).toBe("");
    expect(actionConfig.purchase.url).toBe("");
  });

  it("defines future check-in records without runtime collection", () => {
    const weight: WeightRecord = { kind: "weight", value: 65, unit: "kg", measuredAt: "2026-10-24T08:00:00+08:00" };
    const waist: WaistRecord = { kind: "waist", value: 80, unit: "cm", measuredAt: "2026-10-24T08:05:00+08:00" };
    const meal: MealCheckIn = { kind: "meal", meal: "breakfast", eatenAt: "2026-10-24T08:10:00+08:00", preMealDrink: true, note: "" };
    expect([weight.kind, waist.kind, meal.kind]).toEqual(["weight", "waist", "meal"]);
  });
});
