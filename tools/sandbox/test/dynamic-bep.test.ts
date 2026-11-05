import { describe, expect, it } from 'vitest';
import { monthlyRecurringBoxes } from '../src/economics';
import { simulate } from '../src/engine';
import type { MonthResult } from '../src/engine';
import { computeChannelFinancials, firstReachedMonth } from '../src/metrics';
import * as metrics from '../src/metrics';
import type { ChannelFinancialBreakdown } from '../src/metrics';
import type { SandboxInput } from '../src/schema';
import { sampleInput } from './fixtures';

const { computeDynamicBEP } = metrics as unknown as {
  computeDynamicBEP(
    month: MonthResult,
    input: SandboxInput,
    channelResult: ChannelFinancialBreakdown,
  ): number | null;
};

function directOnlyInput(): SandboxInput {
  const input = sampleInput();
  input.coaches.initialCandidates = 0;
  input.coaches.initialSupportRecords = 0;
  input.coaches.candidateRate = 0;
  input.coaches.supportCompletionRate = 0;
  input.coaches.monthlyNewUsersPerCoach = 0;
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

function dynamicFor(month: MonthResult, input: SandboxInput): number | null {
  return computeDynamicBEP(month, input, computeChannelFinancials(month, input));
}

function expectedUncappedBEP(month: MonthResult, input: SandboxInput): number {
  const channels = computeChannelFinancials(month, input);
  const effectiveBoxes = month.directPaidBoxes + month.coachSoldBoxes;
  const variableContribution = channels.direct.operatingContribution
    + channels.coach.operatingContribution
    - channels.direct.overhead
    - channels.coach.overhead
    - month.staffPerformance
    - month.incubationReward;
  const contributionPerUser = monthlyRecurringBoxes(input.product) * variableContribution / effectiveBoxes;
  return (month.fixedCosts + month.staffBaseSalary) / contributionPerUser;
}

describe('批次 2：动态 BEP', () => {
  it('按当月真实双渠道贡献与公共费用计算混合维持用户 BEP', () => {
    const input = mixedInput();
    const month = simulate(input).months[1];
    expect(month.directPaidBoxes).toBeGreaterThan(0);
    expect(month.coachSoldBoxes).toBeGreaterThan(0);

    const result = dynamicFor(month, input);
    const expected = expectedUncappedBEP(month, input);
    expect(expected).toBeGreaterThan(0);
    expect(result).toBe(Math.ceil(expected));
  });

  it('非正单位贡献返回 null', () => {
    const input = mixedInput();
    input.product.unitCost = 2000;
    const month = simulate(input).months[1];
    expect(month.directPaidBoxes + month.coachSoldBoxes).toBeGreaterThan(0);

    expect(dynamicFor(month, input)).toBeNull();
  });

  it('零有效销量返回 null', () => {
    const input = directOnlyInput();
    input.seed.phase1.users = 0;
    input.seed.phase2.users = 0;
    input.users.directNewUsersPerMonth = 0;
    const month = simulate(input).months[0];
    expect(month.directPaidBoxes + month.coachSoldBoxes).toBe(0);

    expect(dynamicFor(month, input)).toBeNull();
  });

  it('用户数量 BEP 向上取整且与月份类 BEP 分离', () => {
    const input = directOnlyInput();
    const months = simulate(input).months;
    const month = months[0];
    const uncapped = expectedUncappedBEP(month, input);
    expect(uncapped).toBeGreaterThan(0);
    expect(Number.isInteger(uncapped)).toBe(false);

    const users = dynamicFor(month, input);
    const breakEvenMonth = firstReachedMonth(months, 'operatingNet');
    expect(users).toBe(Math.ceil(uncapped));
    expect(Number.isInteger(users)).toBe(true);
    expect(users).toBeGreaterThan(input.horizonMonths);
    expect(breakEvenMonth === null || breakEvenMonth <= input.horizonMonths).toBe(true);
  });

  it('单位成本盒价与固定成本变化时按正确方向实时重算', () => {
    const baseInput = directOnlyInput();
    const highCostInput = directOnlyInput();
    highCostInput.product.unitCost += 50;
    const lowPriceInput = directOnlyInput();
    lowPriceInput.product.boxPrice -= 50;
    const lowFixedInput = directOnlyInput();
    lowFixedInput.finance.rent -= 5000;

    const base = dynamicFor(simulate(baseInput).months[0], baseInput);
    const highCost = dynamicFor(simulate(highCostInput).months[0], highCostInput);
    const lowPrice = dynamicFor(simulate(lowPriceInput).months[0], lowPriceInput);
    const lowFixed = dynamicFor(simulate(lowFixedInput).months[0], lowFixedInput);

    expect(base).not.toBeNull();
    expect(highCost!).toBeGreaterThan(base!);
    expect(lowPrice!).toBeGreaterThan(base!);
    expect(lowFixed!).toBeLessThan(base!);
  });

  it('现状与增长使用不同月度序列并产生不同 BEP 序列', () => {
    const currentInput = mixedInput();
    const growthInput = mixedInput();
    growthInput.users.directNewUsersPerMonth = 15;
    growthInput.coaches.monthlyNewUsersPerCoach = 8;
    const currentMonths = simulate(currentInput, 'baseline').months;
    const growthMonths = simulate(growthInput, 'upside').months;

    expect(growthMonths.map((month) => month.directPaidBoxes)).not.toEqual(
      currentMonths.map((month) => month.directPaidBoxes),
    );
    expect(growthMonths.map((month) => month.coachSoldBoxes)).not.toEqual(
      currentMonths.map((month) => month.coachSoldBoxes),
    );

    const currentSeries = currentMonths.map((month) => dynamicFor(month, currentInput));
    const growthSeries = growthMonths.map((month) => dynamicFor(month, growthInput));
    expect(growthSeries).not.toEqual(currentSeries);
  });
});
