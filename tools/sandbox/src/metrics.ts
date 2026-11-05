import { channelUnitEconomics, monthlyRecurringBoxes } from './economics';
import { resolveUserRates, simulate } from './engine';
import type { MonthResult } from './engine';
import type { Channel } from './economics';
import type { SandboxInput, ScenarioKey } from './schema';

export interface LTVResult {
  firstPurchaseContribution: number;
  monthlyContribution: number;
  netLTV: { '6': number; '12': number; '24': number };
}

export interface CEOMetrics {
  minCashBalance: number; cashBreakMonth: number | null;
  operatingBreakEvenMonth: number | null; sustainableBreakEvenMonth: number | null;
  cashPaybackMonth: number | null; endingCash: number; cashSafetyMonths: number;
  activeCoaches: number; dormantCoaches: number; dormancyRate: number;
  coachInventory: number; dormantInventory: number; shortageBoxes: number;
  capacityUtilization: number; staffExpansionGap: number;
}

export interface ScenarioResult {
  scenario: ScenarioKey; months: MonthResult[]; metrics: CEOMetrics;
  equivalentMaintenanceBEP: Array<number | null>;
  ltv: { coach: LTVResult; direct: LTVResult };
}
export interface DashboardResult { scenarios: Record<ScenarioKey, ScenarioResult>; }

export interface ChannelFinancialBase {
  confirmedRevenue: number;
  productCost: number;
  overhead: number;
  terminalGMV: number;
  operatingContribution: number;
  operatingNet: number | null;
  rewardOffsetUsed: number;
  rewardCash: number;
  rewardOffsetAccrued: number;
}

export interface DirectChannelFinancials extends ChannelFinancialBase {
  paidBoxes: number;
  freeBoxes: number;
}

export interface CoachChannelFinancials extends ChannelFinancialBase {
  orderBoxes: number;
  firstCaseBoxes: number;
  netCashFlow: number;
}

export interface ChannelFinancialBreakdown {
  direct: DirectChannelFinancials;
  coach: CoachChannelFinancials;
  directCommon: number | null;
  coachCommon: number | null;
  unallocatedCommonCosts: number;
}

export function computeChannelFinancials(
  month: MonthResult,
  input: SandboxInput,
): ChannelFinancialBreakdown {
  const directProductCost = (month.directPaidBoxes + month.directFreeBoxes) * input.product.unitCost;
  const coachProductCost = month.coachOrderBoxes * input.product.unitCost;
  const directTerminalGMV = month.directPaidBoxes * input.product.boxPrice;
  const coachTerminalGMV = month.coachSoldBoxes * input.product.boxPrice;
  const directOverhead = directTerminalGMV * input.finance.overheadRate;
  const coachOverhead = coachTerminalGMV * input.finance.overheadRate;
  const directOperatingContribution = month.directRevenue - directProductCost;
  const coachOperatingContribution = month.coachOrderRevenue
    - coachProductCost
    - month.dataRewards
    - month.referralRewards;

  const commonCosts = month.fixedCosts + month.staffBaseSalary;
  const hasConfirmedRevenue = month.confirmedRevenue > 0;
  const directCommon = hasConfirmedRevenue
    ? commonCosts * month.directRevenue / month.confirmedRevenue
    : null;
  const coachCommon = hasConfirmedRevenue
    ? commonCosts * month.coachOrderRevenue / month.confirmedRevenue
    : null;

  return {
    direct: {
      confirmedRevenue: month.directRevenue,
      paidBoxes: month.directPaidBoxes,
      freeBoxes: month.directFreeBoxes,
      productCost: directProductCost,
      overhead: directOverhead,
      terminalGMV: directTerminalGMV,
      operatingContribution: directOperatingContribution,
      operatingNet: directCommon === null
        ? null
        : directOperatingContribution - directOverhead - directCommon,
      rewardOffsetUsed: 0,
      rewardCash: 0,
      rewardOffsetAccrued: 0,
    },
    coach: {
      confirmedRevenue: month.coachOrderRevenue,
      orderBoxes: month.coachOrderBoxes,
      firstCaseBoxes: month.firstCaseBoxes,
      productCost: coachProductCost,
      overhead: coachOverhead,
      terminalGMV: coachTerminalGMV,
      operatingContribution: coachOperatingContribution,
      operatingNet: coachCommon === null
        ? null
        : coachOperatingContribution
          - coachOverhead
          - month.staffPerformance
          - month.incubationReward
          - coachCommon,
      netCashFlow: month.coachOrderRevenue
        - month.rewardOffsetUsed
        - coachProductCost
        - month.rewardCash
        - coachOverhead
        - month.staffPerformance
        - month.incubationReward
        - (coachCommon ?? 0),
      rewardOffsetUsed: month.rewardOffsetUsed,
      rewardCash: month.rewardCash,
      rewardOffsetAccrued: month.rewardOffsetAccrued,
    },
    directCommon,
    coachCommon,
    unallocatedCommonCosts: hasConfirmedRevenue ? 0 : commonCosts,
  };
}

export function computeDynamicBEP(
  month: MonthResult,
  input: SandboxInput,
  channelResult: ReturnType<typeof computeChannelFinancials>,
): number | null {
  const effectiveBoxes = month.directPaidBoxes + month.coachSoldBoxes;
  if (effectiveBoxes <= 0) return null;

  const variableContribution = channelResult.direct.operatingContribution
    + channelResult.coach.operatingContribution
    - channelResult.direct.overhead
    - channelResult.coach.overhead
    - month.staffPerformance
    - month.incubationReward;
  const contributionPerUser = monthlyRecurringBoxes(input.product)
    * variableContribution
    / effectiveBoxes;
  if (contributionPerUser <= 0 || !Number.isFinite(contributionPerUser)) return null;

  const commonCosts = month.fixedCosts + month.staffBaseSalary;
  const users = commonCosts / contributionPerUser;
  return Number.isFinite(users) ? Math.ceil(users) : null;
}

export interface RunwayMetrics {
  maxOperatingLoss: number;
  maxOperatingLossMonth: number | null;
  maxCashGap: number;
  runway: number | null;
}

export function computeRunwayMetrics(
  months: MonthResult[],
  cashWarningLine: number,
): RunwayMetrics {
  if (months.length === 0) {
    return { maxOperatingLoss: 0, maxOperatingLossMonth: null, maxCashGap: 0, runway: null };
  }

  const initialCash = months[0].cashBalance - months[0].netCashFlow;
  let runway = initialCash < cashWarningLine ? 0 : null;
  let minOperatingNet = months[0].operatingNet;
  let maxOperatingLossMonth = months[0].operatingNet < 0 ? months[0].month : null;
  let minCashBalance = months[0].cashBalance;

  for (const month of months) {
    if (month.operatingNet < minOperatingNet) {
      minOperatingNet = month.operatingNet;
      maxOperatingLossMonth = month.month;
    }
    if (month.cashBalance < minCashBalance) minCashBalance = month.cashBalance;
    if (runway === null && month.cashBalance < cashWarningLine) runway = month.month;
  }

  return {
    maxOperatingLoss: Math.max(0, -minOperatingNet),
    maxOperatingLossMonth,
    maxCashGap: Math.max(0, cashWarningLine - minCashBalance),
    runway,
  };
}

export function firstReachedMonth(
  months: MonthResult[],
  key: 'operatingNet' | 'cumulativeCashFlow',
  sustainableInput?: SandboxInput,
): number | null {
  for (const month of months) {
    const value = sustainableInput ? sustainableOperatingNet(month, sustainableInput) : month[key];
    if (value >= 0) return month.month;
  }
  return null;
}

export function sustainableOperatingNet(month: MonthResult, input: SandboxInput): number {
  const firstCaseContribution = month.firstCaseBoxes * (input.product.coachPurchasePrice - input.product.unitCost);
  return month.operatingNet - firstCaseContribution;
}

export function equivalentMaintenanceBEP(month: MonthResult, input: SandboxInput): number | null {
  const totalBoxes = month.coachSoldBoxes + month.directPaidBoxes;
  if (totalBoxes <= 0) return null;
  const coach = channelUnitEconomics(input, 'coach');
  const direct = channelUnitEconomics(input, 'direct');
  const mixedContribution = (
    month.coachSoldBoxes * coach.platformVariableContributionPerBox +
    month.directPaidBoxes * direct.platformVariableContributionPerBox
  ) / totalBoxes;
  const perUser = monthlyRecurringBoxes(input.product) * mixedContribution;
  if (perUser <= 0) return null;
  return Math.ceil((month.fixedCosts + month.staffBaseSalary) / perUser);
}

export function calculateChannelLTV(input: SandboxInput, channel: Channel, scenario: ScenarioKey): LTVResult {
  const eco = channelUnitEconomics(input, channel);
  const rates = resolveUserRates(input, scenario);
  const firstPurchaseContribution = input.product.firstPurchaseBoxes * eco.platformVariableContributionPerBox;
  const monthlyContribution = monthlyRecurringBoxes(input.product) * eco.platformVariableContributionPerBox;
  const netLTV = { '6': 0, '12': 0, '24': 0 };
  for (const horizon of [6, 12, 24]) {
    let campUsers = 1;
    let maintenanceUsers = 0;
    let ltv = 0;
    for (let month = 1; month <= horizon; month++) {
      ltv += campUsers * firstPurchaseContribution + maintenanceUsers * monthlyContribution;
      const completed = campUsers * rates.completionRate;
      const nextMaintenanceUsers = maintenanceUsers * rates.monthlyRetention + completed * rates.maintenanceRate;
      campUsers = completed * rates.extensionRate;
      maintenanceUsers = nextMaintenanceUsers;
    }
    netLTV[String(horizon) as '6' | '12' | '24'] = ltv;
  }
  return { firstPurchaseContribution, monthlyContribution, netLTV };
}

export function summarizeScenario(input: SandboxInput, scenario: ScenarioKey): ScenarioResult {
  const months = simulate(input, scenario).months;
  const last = months[months.length - 1];
  let minCashBalance = months[0].cashBalance;
  let cashBreakMonth: number | null = null;
  let cashPaybackMonth: number | null = null;
  for (const month of months) {
    if (month.cashBalance < minCashBalance) minCashBalance = month.cashBalance;
    if (cashBreakMonth === null && month.cashBalance < 0) cashBreakMonth = month.month;
    if (cashPaybackMonth === null && month.cumulativeCashFlow >= 0) cashPaybackMonth = month.month;
  }
  const operatingBreakEvenMonth = firstReachedMonth(months, 'operatingNet');
  const sustainableBreakEvenMonth = firstReachedMonth(months, 'operatingNet', input);
  const dormantDenominator = last.endingActiveCoaches + last.newlyDormantCoaches;
  const metrics: CEOMetrics = {
    minCashBalance, cashBreakMonth, operatingBreakEvenMonth, sustainableBreakEvenMonth,
    cashPaybackMonth, endingCash: last.cashBalance,
    cashSafetyMonths: cashBreakMonth === null ? input.horizonMonths : Math.max(0, cashBreakMonth - 1),
    activeCoaches: last.endingActiveCoaches, dormantCoaches: last.newlyDormantCoaches,
    dormancyRate: dormantDenominator > 0 ? last.newlyDormantCoaches / dormantDenominator : 0,
    coachInventory: last.coachInventory, dormantInventory: last.dormantInventory,
    shortageBoxes: last.shortageBoxes, capacityUtilization: last.capacityUtilization,
    staffExpansionGap: last.staffExpansionGap,
  };
  const bepSeries: Array<number | null> = [];
  for (const month of months) bepSeries.push(equivalentMaintenanceBEP(month, input));
  return {
    scenario, months, metrics, equivalentMaintenanceBEP: bepSeries,
    ltv: {
      coach: calculateChannelLTV(input, 'coach', scenario),
      direct: calculateChannelLTV(input, 'direct', scenario),
    },
  };
}

export function buildDashboard(input: SandboxInput): DashboardResult {
  return {
    scenarios: {
      baseline: summarizeScenario(input, 'baseline'),
      stress: summarizeScenario(input, 'stress'),
      upside: summarizeScenario(input, 'upside'),
    },
  };
}
