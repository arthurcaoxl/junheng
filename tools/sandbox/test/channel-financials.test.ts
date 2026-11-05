import { describe, expect, it } from 'vitest';
import { simulate } from '../src/engine';
import type { MonthResult } from '../src/engine';
import * as metrics from '../src/metrics';
import type { SandboxInput } from '../src/schema';
import { sampleInput } from './fixtures';

const { computeChannelFinancials } = metrics as unknown as {
  computeChannelFinancials(month: MonthResult, input: SandboxInput): any;
};

const TOLERANCE = 1e-9;

function expectClose(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(TOLERANCE);
}

function directOnlyInput(): SandboxInput {
  const input = sampleInput();
  input.coaches.initialCandidates = 0;
  input.coaches.initialSupportRecords = 0;
  input.coaches.candidateRate = 0;
  input.coaches.supportCompletionRate = 0;
  input.coaches.monthlyNewUsersPerCoach = 0;
  return input;
}

function coachOnlyInput(): SandboxInput {
  const input = sampleInput();
  input.seed.phase1.users = 0;
  input.seed.phase2.users = 0;
  input.users.directNewUsersPerMonth = 0;
  input.coaches.initialCandidates = 1;
  input.coaches.initialSupportRecords = 8;
  input.coaches.candidateRate = 0;
  input.coaches.supportCompletionRate = 0;
  input.coaches.monthlyNewUsersPerCoach = 6;
  input.staff.autoExpand = false;
  return input;
}

function mixedInput(): SandboxInput {
  const input = sampleInput();
  input.coaches.initialCandidates = 1;
  input.coaches.initialSupportRecords = 8;
  input.coaches.candidateRate = 0;
  input.coaches.supportCompletionRate = 0;
  input.staff.autoExpand = false;
  return input;
}

function expectPlatformReconciliation(result: any, month: MonthResult): void {
  expectClose(
    result.direct.confirmedRevenue + result.coach.confirmedRevenue,
    month.confirmedRevenue,
  );
  expectClose(result.direct.productCost + result.coach.productCost, month.productCost);
  expectClose(result.direct.overhead + result.coach.overhead, month.overhead);
  expect(result.direct.operatingNet).not.toBeNull();
  expect(result.coach.operatingNet).not.toBeNull();
  expectClose(result.direct.operatingNet + result.coach.operatingNet, month.operatingNet);
  expectClose(result.directCommon + result.coachCommon, month.fixedCosts + month.staffBaseSalary);
  expectClose(result.unallocatedCommonCosts, 0);
}

describe('批次 1：双渠道财务拆解', () => {
  it('纯直营场景：教练收入成本为零，直营承担全部公共费用', () => {
    const input = directOnlyInput();
    const month = simulate(input).months[0];
    expect(month.confirmedRevenue).toBeGreaterThan(0);
    expect(month.coachOrderRevenue).toBe(0);

    const result = computeChannelFinancials(month, input);

    expect(result.coach.confirmedRevenue).toBe(0);
    expect(result.coach.orderBoxes).toBe(0);
    expect(result.coach.productCost).toBe(0);
    expect(result.coach.overhead).toBe(0);
    expect(result.coach.operatingContribution).toBe(0);
    expect(result.coach.operatingNet).toBe(0);
    expect(result.coachCommon).toBe(0);
    expectClose(result.directCommon, month.fixedCosts + month.staffBaseSalary);
    expect(result.direct.confirmedRevenue).toBeGreaterThan(0);
    expect(result.direct.productCost).toBeGreaterThan(0);
    expectPlatformReconciliation(result, month);
  });

  it('纯教练场景：直营收入付费盒免费盒成本为零，教练承担全部公共费用', () => {
    const input = coachOnlyInput();
    const month = simulate(input).months[1];
    expect(month.coachOrderRevenue).toBeGreaterThan(0);
    expect(month.directRevenue).toBe(0);

    const result = computeChannelFinancials(month, input);

    expect(result.direct.confirmedRevenue).toBe(0);
    expect(result.direct.paidBoxes).toBe(0);
    expect(result.direct.freeBoxes).toBe(0);
    expect(result.direct.productCost).toBe(0);
    expect(result.direct.overhead).toBe(0);
    expect(result.direct.operatingContribution).toBe(0);
    expect(result.direct.operatingNet).toBe(0);
    expect(result.directCommon).toBe(0);
    expectClose(result.coachCommon, month.fixedCosts + month.staffBaseSalary);
    expect(result.coach.orderBoxes).toBeGreaterThan(0);
    expect(result.coach.productCost).toBeGreaterThan(0);
    expectPlatformReconciliation(result, month);
  });

  it('双渠道混合场景：收入成本平摊经营净额均以 1e-9 容差重建平台总账', () => {
    const input = mixedInput();
    const month = simulate(input).months[1];
    expect(month.directRevenue).toBeGreaterThan(0);
    expect(month.coachOrderRevenue).toBeGreaterThan(0);
    expect(month.directPaidBoxes).toBeGreaterThan(0);
    expect(month.coachSoldBoxes).toBeGreaterThan(0);

    const result = computeChannelFinancials(month, input);

    expect(result.directCommon).toBeGreaterThan(0);
    expect(result.coachCommon).toBeGreaterThan(0);
    expectClose(result.direct.terminalGMV, month.directPaidBoxes * input.product.boxPrice);
    expectClose(result.coach.terminalGMV, month.coachSoldBoxes * input.product.boxPrice);
    expectClose(
      result.direct.confirmedRevenue + result.coach.confirmedRevenue,
      month.confirmedRevenue,
    );
    expect(result.coach.confirmedRevenue).not.toBe(
      month.coachOrderRevenue + result.coach.terminalGMV,
    );
    expectPlatformReconciliation(result, month);

    const months = simulate(input).months;
    const results = months.map((current) => {
      const breakdown = computeChannelFinancials(current, input);
      expectPlatformReconciliation(breakdown, current);
      return breakdown;
    });
    const platformTotal = (select: (current: MonthResult) => number) =>
      months.reduce((sum, current) => sum + select(current), 0);

    expectClose(
      results.reduce(
        (sum, current) => sum + current.direct.confirmedRevenue + current.coach.confirmedRevenue,
        0,
      ),
      platformTotal((current) => current.confirmedRevenue),
    );
    expectClose(
      results.reduce(
        (sum, current) => sum + current.direct.productCost + current.coach.productCost,
        0,
      ),
      platformTotal((current) => current.productCost),
    );
    expectClose(
      results.reduce(
        (sum, current) => sum + current.direct.overhead + current.coach.overhead,
        0,
      ),
      platformTotal((current) => current.overhead),
    );
    expectClose(
      results.reduce(
        (sum, current) => sum + current.direct.operatingNet + current.coach.operatingNet,
        0,
      ),
      platformTotal((current) => current.operatingNet),
    );
  });

  it('免费种子盒与教练首箱：零收入公共费用不分摊，首箱不重复计收入成本', () => {
    const freeOnly = directOnlyInput();
    freeOnly.users.directNewUsersPerMonth = 0;
    freeOnly.seed.phase1.users = 20;
    freeOnly.seed.phase1.weekCompletionRate = 0.8;
    freeOnly.seed.phase1.finalPurchaseRate = 0;
    freeOnly.seed.phase2.users = 0;
    const freeMonth = simulate(freeOnly).months[0];
    expect(freeMonth.confirmedRevenue).toBe(0);
    expect(freeMonth.directFreeBoxes).toBe(36);
    expect(freeMonth.productCost).toBeGreaterThan(0);

    const freeResult = computeChannelFinancials(freeMonth, freeOnly);
    expect(freeResult.direct.freeBoxes).toBe(36);
    expectClose(freeResult.direct.productCost, freeMonth.productCost);
    expect(freeResult.coach.productCost).toBe(0);
    expect(freeResult.directCommon).toBeNull();
    expect(freeResult.coachCommon).toBeNull();
    expectClose(
      freeResult.unallocatedCommonCosts,
      freeMonth.fixedCosts + freeMonth.staffBaseSalary,
    );
    expect(freeResult.direct.operatingNet).toBeNull();
    expect(freeResult.coach.operatingNet).toBeNull();

    const coachInput = coachOnlyInput();
    const firstCaseMonth = simulate(coachInput).months[1];
    const firstCaseResult = computeChannelFinancials(firstCaseMonth, coachInput);
    expect(firstCaseResult.coach.firstCaseBoxes).toBe(24);
    expect(firstCaseResult.coach.orderBoxes).toBe(24);
    expect(firstCaseResult.coach.orderBoxes).toBe(firstCaseMonth.coachOrderBoxes);
    expectClose(
      firstCaseResult.coach.confirmedRevenue,
      24 * coachInput.product.coachPurchasePrice,
    );
    expectClose(firstCaseResult.coach.productCost, 24 * coachInput.product.unitCost);
    expectPlatformReconciliation(firstCaseResult, firstCaseMonth);
  });

  it('奖励与现金抵扣分离：抵扣不重复扣经营利润，奖励现金与计提进入教练现金账本', () => {
    const input = coachOnlyInput();
    const month = simulate(input).months[2];
    expect(month.rewardOffsetUsed).toBeGreaterThan(0);
    expect(month.rewardCash).toBeGreaterThan(0);
    expect(month.rewardOffsetAccrued).toBeGreaterThan(0);
    expect(month.directRevenue).toBe(0);
    expect(month.coachOrderBoxes).toBeGreaterThan(0);

    const result = computeChannelFinancials(month, input);
    expect(result.coach.firstCaseBoxes).toBe(0);
    expect(result.coach.orderBoxes).toBe(month.coachOrderBoxes);
    expect(result.coach.orderBoxes).toBeGreaterThan(0);
    const coachOverhead = month.coachSoldBoxes * input.product.boxPrice * input.finance.overheadRate;
    const expectedOperatingNet = month.coachOrderRevenue
      - month.coachOrderBoxes * input.product.unitCost
      - month.dataRewards
      - month.referralRewards
      - coachOverhead
      - month.staffPerformance
      - month.incubationReward
      - result.coachCommon;
    const expectedNetCashFlow = month.coachOrderRevenue
      - month.rewardOffsetUsed
      - month.coachOrderBoxes * input.product.unitCost
      - month.rewardCash
      - coachOverhead
      - month.staffPerformance
      - month.incubationReward
      - result.coachCommon;

    expectClose(result.coach.operatingNet, expectedOperatingNet);
    expectClose(result.coach.netCashFlow, expectedNetCashFlow);
    expectClose(result.coach.netCashFlow, month.netCashFlow);
    expect(result.coach.rewardOffsetUsed).toBe(month.rewardOffsetUsed);
    expect(result.coach.rewardCash).toBe(month.rewardCash);
    expect(result.coach.rewardOffsetAccrued).toBe(month.rewardOffsetAccrued);
    expect(result.direct.rewardOffsetUsed).toBe(0);
    expect(result.direct.rewardCash).toBe(0);
    expect(result.direct.rewardOffsetAccrued).toBe(0);
    expectPlatformReconciliation(result, month);
  });

  it('修改盒价或教练拿货价：渠道贡献方向正确且合计始终勾稽', () => {
    const lowDirectInput = directOnlyInput();
    const highDirectInput = directOnlyInput();
    highDirectInput.product.boxPrice += 50;
    const lowDirectMonth = simulate(lowDirectInput).months[0];
    const highDirectMonth = simulate(highDirectInput).months[0];
    const lowDirect = computeChannelFinancials(lowDirectMonth, lowDirectInput);
    const highDirect = computeChannelFinancials(highDirectMonth, highDirectInput);

    expect(highDirect.direct.operatingContribution).toBeGreaterThan(
      lowDirect.direct.operatingContribution,
    );
    expect(highDirect.direct.operatingNet).toBeGreaterThan(lowDirect.direct.operatingNet);
    expectPlatformReconciliation(lowDirect, lowDirectMonth);
    expectPlatformReconciliation(highDirect, highDirectMonth);

    const lowCoachInput = coachOnlyInput();
    const highCoachInput = coachOnlyInput();
    highCoachInput.product.coachPurchasePrice += 20;
    const lowCoachMonth = simulate(lowCoachInput).months[1];
    const highCoachMonth = simulate(highCoachInput).months[1];
    const lowCoach = computeChannelFinancials(lowCoachMonth, lowCoachInput);
    const highCoach = computeChannelFinancials(highCoachMonth, highCoachInput);

    expect(highCoach.coach.operatingContribution).toBeGreaterThan(
      lowCoach.coach.operatingContribution,
    );
    expect(highCoach.coach.operatingNet).toBeGreaterThan(lowCoach.coach.operatingNet);
    expectPlatformReconciliation(lowCoach, lowCoachMonth);
    expectPlatformReconciliation(highCoach, highCoachMonth);
  });
});
