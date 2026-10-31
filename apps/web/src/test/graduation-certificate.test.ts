import { describe, expect, it, vi } from "vitest";
import type { CheckInState } from "../utils/checkin";
import { addDays, emptyDay } from "../utils/checkin";
import { canGraduate, createGraduationCertificate, getCertificateNumber, getLifetimeRecordedDays } from "../utils/graduationCertificate";

function stateWithDates(dates: string[]): CheckInState {
  return {
    schema: 3,
    userCode: "JH-WQAKS",
    startDate: "2026-01-01",
    records: Object.fromEntries(dates.map((date) => [date, { ...emptyDay(), weight: "70" }])),
  };
}

const twentyDates = Array.from({ length: 20 }, (_, index) => addDays("2026-01-01", index));

describe("结业证书资格与编号", () => {
  it("累计 20 个有效打卡日时保持锁定", () => {
    const state = stateWithDates(twentyDates);
    expect(getLifetimeRecordedDays(state)).toBe(20);
    expect(canGraduate(state)).toBe(false);
  });

  it("允许非连续且跨期的 21 个历史打卡日解锁", () => {
    const state = stateWithDates([...twentyDates, "2026-03-15"]);
    expect(getLifetimeRecordedDays(state)).toBe(21);
    expect(canGraduate(state)).toBe(true);
  });

  it("空记录不计入证书进度", () => {
    const state = stateWithDates(twentyDates);
    state.records["2026-03-15"] = emptyDay();
    expect(getLifetimeRecordedDays(state)).toBe(20);
    expect(canGraduate(state)).toBe(false);
  });

  it("同一期数据重复生成的证书编号保持稳定", () => {
    const state = stateWithDates([]);
    expect(getCertificateNumber(state)).toBe("FUNGIBLEND-2026-WQAKS");
    expect(getCertificateNumber(state)).toBe(getCertificateNumber({ ...state }));
  });

  it("PNG 使用固定会员落款并写入完整纪念证书边界声明", () => {
    const context = {
      fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,certificate");
    const state = stateWithDates([...twentyDates, "2026-03-15"]);

    expect(createGraduationCertificate(state, "")).toBe("data:image/png;base64,certificate");
    expect(context.fillText).toHaveBeenCalledWith("脂代谢研究所会员", expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("本证书为品牌内部会员成长纪念，不属于学历、职业资格、科研身份或医疗证明。", expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("会员纪念", expect.any(Number), expect.any(Number));
    vi.restoreAllMocks();
  });
});
