import { describe, expect, it } from 'vitest';
import {
  buildDashboard, calculateChannelLTV, equivalentMaintenanceBEP,
  firstReachedMonth, sustainableOperatingNet, summarizeScenario,
} from '../src/metrics';
import { channelUnitEconomics, monthlyRecurringBoxes } from '../src/economics';
import { simulate } from '../src/engine';
import { sampleInput } from './fixtures';

describe('CEO 经营指标', () => {
  it('持续经营口径剔除新教练首箱拿货贡献', () => {
    const input = sampleInput();
    const month = simulate(input).months[1];
    const expected = month.operatingNet - month.firstCaseBoxes * (input.product.coachPurchasePrice - input.product.unitCost);
    expect(sustainableOperatingNet(month, input)).toBeCloseTo(expected, 8);
  });

  it('首次非负月份只认真实达到，推演期未达返回 null', () => {
    const input = sampleInput();
    input.horizonMonths = 1;
    input.seed.phase1.users = 0;
    input.seed.phase2.users = 0;
    input.users.directNewUsersPerMonth = 0;
    input.finance.rent = 1000000;
    const metrics = summarizeScenario(input, 'baseline').metrics;
    expect(metrics.operatingBreakEvenMonth).toBeNull();
    expect(metrics.sustainableBreakEvenMonth).toBeNull();
    expect(metrics.cashPaybackMonth).toBeNull();
    expect(metrics.cashBreakMonth).toBe(1);
    expect(firstReachedMonth(simulate(input).months, 'operatingNet')).toBeNull();
  });

  it('唯一服务教练月末休眠时 CEO 期末活跃为零且休眠率为 100%', () => {
    const input = sampleInput();
    input.horizonMonths = 2;
    input.seed.phase1.users = 0;
    input.seed.phase2.users = 0;
    input.users.directNewUsersPerMonth = 0;
    input.coaches.initialCandidates = 1;
    input.coaches.initialSupportRecords = 8;
    input.coaches.candidateRate = 0;
    input.coaches.supportCompletionRate = 0;
    input.coaches.monthlyNewUsersPerCoach = 1;
    input.staff.autoExpand = false;
    const metrics = summarizeScenario(input, 'baseline').metrics;
    expect(metrics.activeCoaches).toBe(0);
    expect(metrics.dormantCoaches).toBe(1);
    expect(metrics.dormancyRate).toBe(1);
  });

  it('等效维持用户 BEP 使用当月真实渠道混合贡献，非正贡献返回 null', () => {
    const input = sampleInput();
    const month = simulate(input).months[0];
    const eco = channelUnitEconomics(input, 'direct');
    const perUser = monthlyRecurringBoxes(input.product) * eco.platformVariableContributionPerBox;
    const expected = Math.ceil((month.fixedCosts + month.staffBaseSalary) / perUser);
    expect(equivalentMaintenanceBEP(month, input)).toBe(expected);

    input.product.coachPurchasePrice = 1;
    input.product.boxPrice = 1;
    input.product.unitCost = 2000;
    const lossMonth = simulate(input).months[0];
    expect(equivalentMaintenanceBEP(lossMonth, input)).toBeNull();
  });

  it('混合直营与教练销量时 BEP 按实际盒数加权贡献', () => {
    const input = sampleInput();
    input.seed.phase1.users = 0;
    input.seed.phase2.users = 0;
    input.coaches.initialCandidates = 1;
    input.coaches.initialSupportRecords = 8;
    input.coaches.candidateRate = 0;
    input.coaches.supportCompletionRate = 0;
    input.coaches.monthlyNewUsersPerCoach = 6;
    const month = simulate(input).months[1];
    expect(month.coachSoldBoxes).toBeGreaterThan(0);
    expect(month.directPaidBoxes).toBeGreaterThan(0);
    const coach = channelUnitEconomics(input, 'coach');
    const direct = channelUnitEconomics(input, 'direct');
    const mixed = (
      month.coachSoldBoxes * coach.platformVariableContributionPerBox +
      month.directPaidBoxes * direct.platformVariableContributionPerBox
    ) / (month.coachSoldBoxes + month.directPaidBoxes);
    const expected = Math.ceil(
      (month.fixedCosts + month.staffBaseSalary) / (monthlyRecurringBoxes(input.product) * mixed),
    );
    expect(equivalentMaintenanceBEP(month, input)).toBe(expected);
  });

  it('零完赛时两个渠道的各期限 LTV 都只有首购贡献', () => {
    const input = sampleInput();
    input.users.completionRate = 0;
    for (const channel of ['coach', 'direct'] as const) {
      const result = calculateChannelLTV(input, channel, 'baseline');
      for (const horizon of ['6', '12', '24'] as const) {
        expect(result.netLTV[horizon]).toBeCloseTo(result.firstPurchaseContribution, 8);
      }
    }
  });

  it('LTV 按月度 cohort 同时响应延伸与维持分流', () => {
    const input = sampleInput();
    const extensionHeavy = sampleInput();
    extensionHeavy.users.extensionRate = 0.6;
    extensionHeavy.users.maintenanceRate = 0.2;
    const expected = {
      direct: { base: 3957.0324120590553, extensionHeavy: 3744.16019516198 },
      coach: { base: 647.3486204059744, extensionHeavy: 612.5239028951628 },
    };
    for (const channel of ['coach', 'direct'] as const) {
      expect(calculateChannelLTV(input, channel, 'baseline').netLTV['12']).toBeCloseTo(expected[channel].base, 8);
      expect(calculateChannelLTV(extensionHeavy, channel, 'baseline').netLTV['12']).toBeCloseTo(expected[channel].extensionHeavy, 8);
    }
  });

  it('LTV 分渠道计算，直营不得套用教练 170 元贡献', () => {
    const input = sampleInput();
    const direct = calculateChannelLTV(input, 'direct', 'baseline');
    const coach = calculateChannelLTV(input, 'coach', 'baseline');
    expect(direct.monthlyContribution).toBeCloseTo(
      monthlyRecurringBoxes(input.product) * channelUnitEconomics(input, 'direct').platformVariableContributionPerBox,
      8,
    );
    expect(coach.monthlyContribution).not.toBeCloseTo(monthlyRecurringBoxes(input.product) * 170, 8);
    expect(direct.netLTV['24']).toBeGreaterThan(coach.netLTV['24']);
  });
});

describe('三场景', () => {
  it('压力与进取系数来自输入，基准不被场景计算修改', () => {
    const input = sampleInput();
    input.scenarios.stress.multipliers.acquisition = 0;
    const dashboard = buildDashboard(input);
    expect(dashboard.scenarios.stress.months[0].direct.newFirstPurchaseUsers).toBe(0);
    expect(dashboard.scenarios.baseline.months[0].direct.newFirstPurchaseUsers).toBe(input.users.directNewUsersPerMonth);
    expect(dashboard.scenarios.upside.months[0].direct.newFirstPurchaseUsers).toBeCloseTo(
      input.users.directNewUsersPerMonth * input.scenarios.upside.multipliers.acquisition,
      8,
    );
  });

  it('每个场景都返回完整月度、CEO 指标、BEP 和双渠道 LTV', () => {
    const dashboard = buildDashboard(sampleInput());
    for (const scenario of ['baseline', 'stress', 'upside'] as const) {
      expect(dashboard.scenarios[scenario].months).toHaveLength(24);
      expect(dashboard.scenarios[scenario].equivalentMaintenanceBEP).toHaveLength(24);
      expect(dashboard.scenarios[scenario].ltv.coach.netLTV['12']).toBeTypeOf('number');
      expect(dashboard.scenarios[scenario].ltv.direct.netLTV['12']).toBeTypeOf('number');
    }
  });
});
