import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyDay } from "../utils/checkin";
import { createRecordPoster } from "../utils/recordPoster";

function mockCanvas() {
  const context = {
    fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })), closePath: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,poster");
  return context;
}

describe("精简健康记录海报", () => {
  afterEach(() => vi.restoreAllMocks());

  it("保持顶部品牌信息，并使用两行新底注", () => {
    const context = mockCanvas();
    createRecordPoster(Array.from({ length: 21 }, () => emptyDay()));

    expect(context.fillText).toHaveBeenCalledWith("菌衡计划 | 脂代谢研究所 × 心脑健康营", 70, 100, 940);
    expect(context.fillText).toHaveBeenCalledWith("我的脂代谢健康记录", 70, 210, 940);
    expect(context.fillText).toHaveBeenCalledWith("加入菌衡计划·脂代谢研究所，用真实记录陪伴长期健康管理。", 70, 1680, 940);
    expect(context.fillText).toHaveBeenCalledWith("本海报由本人主动生成，仅代表个人健康记录，不构成医疗诊断或产品功效承诺。", 70, 1740, 940);
    expect(context.fillText).not.toHaveBeenCalledWith("FUNGIBLEND LIPID METABOLISM RESEARCH INSTITUTE", 70, 100);
    const posterText = context.fillText.mock.calls.map(([text]) => String(text));
    expect(posterText.some((text) => text.startsWith("腰围变化："))).toBe(false);
    expect(posterText).not.toContain("仅为个人健康记录，不代表固定减重目标或产品功效。");
  });

  it("紧凑绘制双趋势图并单行汇总习惯", () => {
    const context = mockCanvas();
    const records = Array.from({ length: 21 }, () => emptyDay());
    const weights = [80, 78, 82, 81, 79];
    const waists = [98, 95, 96, 94, 95];
    weights.forEach((weight, index) => {
      records[index].weight = String(weight);
      records[index].waist = String(waists[index]);
    });
    records.slice(0, 4).forEach((day) => { day.meals = [true, true, true]; });
    records[4].meals = [true, true, false];
    records.slice(0, 4).forEach((day) => { day.water = true; day.movement = true; });
    records.slice(0, 3).forEach((day) => { day.sleep = true; });

    createRecordPoster(records, "曹先生", { userCode: "JH-7KW8Z", startDate: "2026-10-27", endDate: "2026-11-16" });

    expect(context.fillText).toHaveBeenCalledWith("记录人：曹先生", 70, 318);
    expect(context.fillText).toHaveBeenCalledWith("体验官代码：JH-7KW8Z", 560, 318);
    expect(context.fillText).toHaveBeenCalledWith("体重趋势 / kg", 70, 450);
    expect(context.fillText).toHaveBeenCalledWith("腰围趋势 / cm", 70, 790);
    expect(context.fillText).toHaveBeenCalledWith("餐前饮用 14/63次 · 饮水 4/21天 · 运动 4/21天 · 作息 3/21天", 70, 1220, 940);
    expect(context.fillText).toHaveBeenCalledWith("周期：2026-10-27 至 2026-11-16", 70, 1300);
    const posterText = context.fillText.mock.calls.map(([text]) => String(text));
    expect(posterText.filter((text) => text === "体重趋势 / kg")).toHaveLength(1);
    expect(posterText.filter((text) => text === "腰围趋势 / cm")).toHaveLength(1);
    expect(posterText).not.toEqual(expect.arrayContaining(["适量饮水", "适量运动", "规律作息", "14 / 63 次"]));
    expect(posterText.filter((text) => ["D1", "D7", "D14", "D21"].includes(text))).toHaveLength(8);
    expect(posterText).not.toEqual(expect.arrayContaining(["D2", "D3", "D4", "D5"]));
    expect(posterText).toEqual(expect.arrayContaining(["80", "78", "82", "79", "98", "95", "94"]));
    expect(posterText).not.toEqual(expect.arrayContaining(["81", "96"]));
    expect(posterText.some((text) => text.startsWith("腰围变化："))).toBe(false);
  });
});
