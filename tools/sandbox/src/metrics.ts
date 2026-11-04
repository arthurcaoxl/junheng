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
