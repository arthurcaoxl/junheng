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

describe("健康记录海报品牌口径", () => {
  afterEach(() => vi.restoreAllMocks());

  it("使用最新中文抬头与主标题，并限制在海报安全宽度内", () => {
    const context = mockCanvas();
    createRecordPoster(Array.from({ length: 21 }, () => emptyDay()));

    expect(context.fillText).toHaveBeenCalledWith("菌衡计划 | 脂代谢研究所 × 心脑健康营", 70, 100, 940);
    expect(context.fillText).toHaveBeenCalledWith("我的脂代谢健康记录", 70, 210, 940);
    expect(context.fillText).toHaveBeenCalledWith("加入菌衡计划·脂代谢研究所，用真实记录陪伴长期健康管理。", 70, 1880);
    expect(context.fillText).toHaveBeenCalledWith("仅为个人健康记录，不代表固定减重目标或产品功效。", 70, 1790);
    expect(context.fillText).not.toHaveBeenCalledWith("FUNGIBLEND LIPID METABOLISM RESEARCH INSTITUTE", 70, 100);
  });
});
