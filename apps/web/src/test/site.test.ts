import { describe, expect, it } from "vitest";
import { actionConfig, siteConfig } from "../config/site";
import type { MealCheckIn, WaistRecord, WeightRecord } from "../types/check-in";

describe("brand configuration", () => {
  it("keeps the approved slogan verbatim", () => {
    expect(siteConfig.slogan).toBe("餐前伴侣助力脂代谢");
    expect(siteConfig.healthStatement).toBe("健康体重管理");
    expect(siteConfig.subtitle).toBe("——23种菌菇精华 × 优质蛋白 × 复合维生素——");
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
