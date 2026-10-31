import { describe, expect, it } from "vitest";
import type { CheckInState } from "../utils/checkin";
import { addDays, emptyDay } from "../utils/checkin";
import { canGraduate, getCertificateNumber, getLifetimeRecordedDays } from "../utils/graduationCertificate";

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
});
