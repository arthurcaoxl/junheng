import { describe, expect, it } from 'vitest';
import { simulate } from '../src/engine';
import type { MonthResult } from '../src/engine';
import * as metrics from '../src/metrics';
import { sampleInput } from './fixtures';

const { computeRunwayMetrics } = metrics as unknown as {
  computeRunwayMetrics(months: MonthResult[], cashWarningLine: number): {
    maxOperatingLoss: number;
    maxOperatingLossMonth: number | null;
    maxCashGap: number;
    runway: number | null;
  };
};

interface CashMonth {
  cashBalance: number;
  operatingNet?: number;
}

function cashSequence(initialCash: number, rows: CashMonth[]): MonthResult[] {
  const template = simulate(sampleInput()).months[0];
  let previousCash = initialCash;
  return rows.map((row, index) => {
    const month = {
      ...template,
      month: index + 1,
      cashBalance: row.cashBalance,
      netCashFlow: row.cashBalance - previousCash,
      operatingNet: row.operatingNet ?? 0,
    };
    previousCash = row.cashBalance;
    return month;
  });
}

describe('批次 3：最大亏损、现金缺口与 Runway', () => {
  it('期初已低于警戒线时 Runway 返回 0', () => {
    const months = cashSequence(80, [{ cashBalance: 90, operatingNet: 10 }]);
    const result = computeRunwayMetrics(months, 100);

    expect(result.runway).toBe(0);
  });

  it('期初安全但首月跌破警戒线时 Runway 返回 1', () => {
    const months = cashSequence(200, [{ cashBalance: 80, operatingNet: -120 }]);
    const result = computeRunwayMetrics(months, 100);

    expect(result.runway).toBe(1);
    expect(result.maxCashGap).toBe(20);
  });

  it('中途触线且恰好等于警戒线不算触线', () => {
    const months = cashSequence(500, [
      { cashBalance: 450 },
      { cashBalance: 375 },
      { cashBalance: 360 },
    ]);
    const result = computeRunwayMetrics(months, 375);

    expect(months[1].cashBalance).toBe(375);
    expect(result.runway).toBe(3);
    expect(result.maxCashGap).toBe(15);
  });

  it('horizon 内始终高于或等于警戒线时 Runway 返回 null', () => {
    const months = cashSequence(100, [
      { cashBalance: 100 },
      { cashBalance: 120 },
      { cashBalance: 110 },
    ]);
    const result = computeRunwayMetrics(months, 100);

    expect(result.runway).toBeNull();
    expect(result.maxCashGap).toBe(0);
  });

  it('最大单月经营亏损取亏损峰值及准确月份并与现金缺口分离', () => {
    const months = cashSequence(1000, [
      { cashBalance: 900, operatingNet: -100 },
      { cashBalance: 750, operatingNet: -250 },
      { cashBalance: 400, operatingNet: -600 },
    ]);
    const result = computeRunwayMetrics(months, 800);

    expect(result.maxOperatingLoss).toBe(600);
    expect(result.maxOperatingLossMonth).toBe(3);
    expect(result.maxCashGap).toBe(400);
    expect(result.maxCashGap).not.toBe(result.maxOperatingLoss);
    expect(result.runway).toBe(2);
  });

  it('经营利润为正但现金因资本支出持续下降时三个指标独立', () => {
    const months = cashSequence(1000, [
      { cashBalance: 900, operatingNet: 100 },
      { cashBalance: 700, operatingNet: 200 },
      { cashBalance: 500, operatingNet: 300 },
    ]);
    const result = computeRunwayMetrics(months, 800);
    const cumulativeOperatingProfit = months.reduce((sum, month) => sum + month.operatingNet, 0);

    expect(result.maxOperatingLoss).toBe(0);
    expect(result.maxOperatingLossMonth).toBeNull();
    expect(result.maxCashGap).toBe(300);
    expect(result.maxCashGap).not.toBe(cumulativeOperatingProfit);
    expect(result.maxCashGap).not.toBe(result.maxOperatingLoss);
    expect(result.runway).toBe(2);
  });

  it('维持与下降使用不同月度序列并产生不同 Runway', () => {
    const maintenanceMonths = cashSequence(500, [
      { cashBalance: 450 },
      { cashBalance: 400 },
      { cashBalance: 350 },
    ]);
    const declineMonths = cashSequence(500, [
      { cashBalance: 300 },
      { cashBalance: 150 },
      { cashBalance: 50 },
    ]);
    expect(declineMonths.map((month) => month.cashBalance)).not.toEqual(
      maintenanceMonths.map((month) => month.cashBalance),
    );

    const maintenance = computeRunwayMetrics(maintenanceMonths, 375);
    const decline = computeRunwayMetrics(declineMonths, 375);
    expect(maintenance.runway).toBe(3);
    expect(decline.runway).toBe(1);
    expect(decline.runway).not.toBe(maintenance.runway);
  });

  it('Runway 逐月定位首次触线而非初始现金除最后月亏损', () => {
    const months = cashSequence(1000, [
      { cashBalance: 800, operatingNet: -500 },
      { cashBalance: 500, operatingNet: -100 },
      { cashBalance: 90, operatingNet: -50 },
    ]);
    const result = computeRunwayMetrics(months, 100);
    const staticDivision = Math.ceil(1000 / 50);

    expect(staticDivision).toBe(20);
    expect(result.runway).toBe(3);
    expect(result.runway).not.toBe(staticDivision);
    expect(result.maxOperatingLossMonth).toBe(1);
  });
});
