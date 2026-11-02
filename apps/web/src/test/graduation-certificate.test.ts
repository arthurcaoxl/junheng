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
const twentyOneDates = [...twentyDates, "2026-03-15"];

function mockCertificateCanvas() {
  const context = {
    fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,certificate");
  return context;
}

describe("代谢重塑见证资格与编号", () => {
  it("累计 20 个有效打卡日时保持锁定", () => {
    const state = stateWithDates(twentyDates);
    expect(getLifetimeRecordedDays(state)).toBe(20);
    expect(canGraduate(state)).toBe(false);
  });

  it("允许非连续且跨期的 21 个历史打卡日解锁", () => {
    const state = stateWithDates(twentyOneDates);
    expect(getLifetimeRecordedDays(state)).toBe(21);
    expect(canGraduate(state)).toBe(true);
  });

  it("空记录不计入见证进度", () => {
    const state = stateWithDates(twentyDates);
    state.records["2026-03-15"] = emptyDay();
    expect(getLifetimeRecordedDays(state)).toBe(20);
    expect(canGraduate(state)).toBe(false);
  });

  it("同一期数据重复生成的见证编号保持稳定", () => {
    const state = stateWithDates([]);
    expect(getCertificateNumber(state)).toBe("FUNGIBLEND-2026-WQAKS");
    expect(getCertificateNumber(state)).toBe(getCertificateNumber({ ...state }));
  });

  it("鼓励牌使用见证标题、完整边界声明与体验官代码", () => {
    const context = mockCertificateCanvas();
    const state = stateWithDates(twentyOneDates);

    expect(createGraduationCertificate(state, "")).toBe("data:image/png;base64,certificate");
    expect(context.fillText).toHaveBeenCalledWith("21 天代谢重塑见证", expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("坚持达成", expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("脂代谢研究所会员", expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("体验官代码 JH-WQAKS", expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("本见证仅纪念自我管理过程，不代表学历、职业资格、医疗或科研身份。", expect.any(Number), expect.any(Number));
    vi.restoreAllMocks();
  });

  it("奖励牌展示减重、腰围正差值与减重达成印章", () => {
    const context = mockCertificateCanvas();
    const state = stateWithDates(twentyOneDates);
    state.records["2026-01-01"] = { ...emptyDay(), weight: "70.5", waist: "80" };
    state.records["2026-03-15"] = { ...emptyDay(), weight: "70", waist: "78.5" };

    createGraduationCertificate(state, "体验官");

    expect(context.fillText).toHaveBeenCalledWith("减重达成", expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("累计减重 0.5 kg · 腰围缩减 1.5 cm", expect.any(Number), expect.any(Number));
    vi.restoreAllMocks();
  });

  it("鼓励牌展示指定正文且绝不渲染体重数据", () => {
    const context = mockCertificateCanvas();
    const state = stateWithDates(twentyOneDates);
    state.records["2026-01-01"] = { ...emptyDay(), weight: "70", waist: "80.5" };
    state.records["2026-03-15"] = { ...emptyDay(), weight: "71", waist: "80" };

    createGraduationCertificate(state, "体验官");

    expect(context.fillText).toHaveBeenCalledWith("体重不是唯一的答案。", expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("21 天全程记录，代谢的真实曲线已被你看见。", expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("腰围缩减 0.5 cm", expect.any(Number), expect.any(Number));
    const texts = context.fillText.mock.calls.map(([text]) => text);
    expect(texts.some((text) => text.includes("累计减重"))).toBe(false);
    vi.restoreAllMocks();
  });

  it("没有任何身体测量值时在绘制前抛出友好错误", () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    const state = stateWithDates(twentyOneDates);
    Object.values(state.records).forEach((day) => {
      day.weight = "";
      day.meals = [true, false, false];
    });

    expect(() => createGraduationCertificate(state, "体验官")).toThrow("暂时没有可用于生成见证的体重或腰围记录，请先完成记录。");
    expect(getContext).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
