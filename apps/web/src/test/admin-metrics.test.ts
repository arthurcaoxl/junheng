import { describe, expect, it } from "vitest";
import type { AdminCamper } from "../services/adminCheckin";
import { buildCampKpis, buildCamperDays, daysSinceLastCheckIn, filterCampers, lastCheckInDate } from "../utils/adminMetrics";

function camper(partial: Partial<AdminCamper>): AdminCamper {
  return {
    authUserId: "uid-1",
    email: "a@example.com",
    userCode: "JH-AAAAA",
    startDate: "2026-10-27",
    updatedAt: "2026-10-30T10:00:00.000Z",
    records: {},
    recordedDays: 0,
    ...partial,
  };
}

const fullDay = { weight: "80", waist: "100", meals: [true, true, false], water: true, movement: true, sleep: true };

describe("buildCampKpis", () => {
  it("aggregates totals, binding rate, today check-ins and average weight change", () => {
    const campers = [
      camper({
        records: {
          "2026-10-27": fullDay,
          "2026-10-30": { ...fullDay, weight: "76", meals: [true, true, true] },
        },
        recordedDays: 2,
      }),
      camper({
        authUserId: "uid-2",
        email: "未绑定邮箱",
        records: { "2026-10-29": { ...fullDay, weight: "60" } },
        recordedDays: 1,
      }),
    ];
    const kpis = buildCampKpis(campers, "2026-10-30");
    expect(kpis.totalCampers).toBe(2);
    expect(kpis.boundCampers).toBe(1);
    expect(kpis.boundRate).toBe(50);
    expect(kpis.todayCheckedIn).toBe(1);
    // uid-1 最新 76/80 = -5%；uid-2 仅一条记录，变化 0%；均值 -2.5%
    expect(kpis.avgWeightChangePercent).toBe(-2.5);
  });

  it("returns null metrics for an empty camp", () => {
    const kpis = buildCampKpis([], "2026-10-30");
    expect(kpis.boundRate).toBeNull();
    expect(kpis.avgWeightChangePercent).toBeNull();
    expect(kpis.todayCheckedIn).toBe(0);
  });
});

describe("buildCamperDays", () => {
  it("aligns D1-D21 with per-day changes and keeps empty days", () => {
    const days = buildCamperDays(camper({
      records: {
        "2026-10-27": fullDay,
        "2026-10-29": { ...fullDay, weight: "78", waist: "99" },
      },
    }));
    expect(days).toHaveLength(21);
    expect(days[0].weightChangePercent).toBe(0);
    expect(days[1].record).toBeNull();
    expect(days[2].weightChangePercent).toBe(-2.5);
    expect(days[2].waistChangePercent).toBe(-1);
    expect(days[20].dayIndex).toBe(21);
  });
});

describe("filters and recency", () => {
  const bound = camper({
    records: { "2026-10-30": fullDay },
    recordedDays: 1,
  });
  const unboundStale = camper({
    authUserId: "uid-2",
    email: "未绑定邮箱",
    records: { "2026-10-27": fullDay },
    recordedDays: 1,
  });

  it("filters unbound and inactive campers", () => {
    const campers = [bound, unboundStale];
    expect(filterCampers(campers, "all", "2026-10-30")).toHaveLength(2);
    expect(filterCampers(campers, "unbound", "2026-10-30").map((c) => c.userCode)).toEqual([unboundStale.userCode]);
    expect(filterCampers(campers, "inactive2d", "2026-10-30").map((c) => c.userCode)).toEqual([unboundStale.userCode]);
    // 10-29 视角：bound 仅有 10-30 的记录，29/28 两天同样未打卡，两人都被标记
    expect(filterCampers(campers, "inactive2d", "2026-10-29")).toHaveLength(2);
  });

  it("computes last check-in recency", () => {
    expect(lastCheckInDate(unboundStale)).toBe("2026-10-27");
    expect(daysSinceLastCheckIn(unboundStale, "2026-10-30")).toBe(3);
    expect(lastCheckInDate(camper({}))).toBeNull();
    expect(daysSinceLastCheckIn(camper({}), "2026-10-30")).toBeNull();
  });
});
