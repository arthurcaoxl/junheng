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
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,certificate");
  return context;
}

/** 印章按传统读序右列先读：右列字符的 x 坐标应大于左列。 */
function expectSealCharacters(context: { fillText: ReturnType<typeof vi.fn> }, chars: string[]) {
  const calls = chars.map((ch) => {
    const call = context.fillText.mock.calls.find(([text]) => text === ch);
    expect(call, `印章应包含白文字符「${ch}」`).toBeTruthy();
    return call as [string, number, number];
  });
  const rightColumnX = (calls[0][1] + calls[1][1]) / 2;
  const leftColumnX = (calls[2][1] + calls[3][1]) / 2;
  expect(rightColumnX).toBeGreaterThan(leftColumnX);
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

  it("鼓励牌保留纸底版式、英文副标题、见证正文与坚持达成印章", () => {
    const context = mockCertificateCanvas();
    const state = stateWithDates(twentyOneDates);

    expect(createGraduationCertificate(state, "")).toBe("data:image/png;base64,certificate");
    expect(context.fillText).toHaveBeenCalledWith("21 天高阶脂代谢研究项目", expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("21天代谢重塑见证", expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("WITNESSED · 21-DAY METABOLIC RESET", expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("体重不是唯一的答案。21 天全程记录，代谢的真实曲线已被你看见。特此见证。", expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("累计有效记录：21天", expect.any(Number), expect.any(Number));
    expectSealCharacters(context, ["坚", "持", "达", "成"]);
    expect(context.fillText).toHaveBeenCalledWith("菌衡计划 · 脂代谢研究所", expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("本见证仅纪念自我管理过程，不代表学历、职业资格、医疗或科研身份。", expect.any(Number), expect.any(Number));
    const texts = context.fillText.mock.calls.map(([text]) => text);
    expect(texts.some((text) => text.includes("结业证书") || text.includes("会员成长纪念"))).toBe(false);
    vi.restoreAllMocks();
  });

  it("奖励牌展示积极正文、减重腰围数据与减重达成印章", () => {
    const context = mockCertificateCanvas();
    const state = stateWithDates(twentyOneDates);
    state.records["2026-01-01"] = { ...emptyDay(), weight: "70.5", waist: "80" };
    state.records["2026-03-15"] = { ...emptyDay(), weight: "70", waist: "78.5" };

    createGraduationCertificate(state, "体验官");

    expect(context.fillText).toHaveBeenCalledWith("该会员已累计完成 21 天真实健康记录，代谢指标呈现积极向好趋势。特此见证。", expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("累计减重 0.5 kg · 腰围缩减 1.5 cm", expect.any(Number), expect.any(Number));
    expectSealCharacters(context, ["减", "重", "达", "成"]);
    vi.restoreAllMocks();
  });

  it("奖励牌仅展示体重正差值，腰围没有缩减时不显示该词条", () => {
    const context = mockCertificateCanvas();
    const state = stateWithDates(twentyOneDates);
    state.records["2026-01-01"] = { ...emptyDay(), weight: "70.5", waist: "" };
    state.records["2026-03-15"] = { ...emptyDay(), weight: "70", waist: "" };

    createGraduationCertificate(state, "体验官");

    expect(context.fillText).toHaveBeenCalledWith("累计减重 0.5 kg", expect.any(Number), expect.any(Number));
    const texts = context.fillText.mock.calls.map(([text]) => text);
    expect(texts.some((text) => text.includes("腰围缩减"))).toBe(false);
    vi.restoreAllMocks();
  });

  it("鼓励牌数据行显示累计记录并在有正腰围差值时追加，绝不渲染体重数据", () => {
    const context = mockCertificateCanvas();
    const state = stateWithDates(twentyOneDates);
    state.records["2026-01-01"] = { ...emptyDay(), weight: "70", waist: "80.5" };
    state.records["2026-03-15"] = { ...emptyDay(), weight: "71", waist: "80" };

    createGraduationCertificate(state, "体验官");

    expect(context.fillText).toHaveBeenCalledWith("累计有效记录：21天 · 腰围缩减 0.5 cm", expect.any(Number), expect.any(Number));
    const texts = context.fillText.mock.calls.map(([text]) => text);
    expect(texts.some((text) => text.includes("累计减重") || text.includes("累计增重"))).toBe(false);
    vi.restoreAllMocks();
  });

  it("印章升级为朱砂白文章:红底方印、纸色内框、边缘做旧且轻微倾斜", () => {
    const context = mockCertificateCanvas();
    const state = stateWithDates(twentyOneDates);

    createGraduationCertificate(state, "体验官");

    // 朱砂红印面（在印章局部坐标系内绘制）
    const base = context.fillRect.mock.calls.find(([x, y, w, h]) => x === 0 && y === 0 && w === h && w >= 120);
    expect(base, "应以实心红底方印替换空心线框").toBeTruthy();
    // 纸色内框细边
    expect(context.strokeRect).toHaveBeenCalledWith(7, 7, base![2] - 14, base![2] - 14);
    // 边缘做旧碎点（纸色 bite）
    const specks = context.fillRect.mock.calls.filter(([x, y, w, h]) => w <= 10 && h <= 10 && !(x === 0 && y === 0));
    expect(specks.length).toBeGreaterThanOrEqual(12);
    // 盖章式轻微旋转（±3° 以内）
    expect(context.rotate).toHaveBeenCalledTimes(1);
    expect(Math.abs(context.rotate.mock.calls[0][0])).toBeLessThan(0.06);
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
