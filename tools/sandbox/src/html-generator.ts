import {
  channelUnitEconomics, monthlyCustomerValue, monthlyRecurringBoxes,
  rewardPerBox, settleCoachOrder, settleCoachRewards,
} from './economics';
import {
  addCompleterOutcomes, applyQualification, calculateStaffCapacity,
  clampRatio, emptyUserChannel, isCoachCohortActive, resolveUserRates,
  runSeedMonth, scenarioMultipliers, simulate, simulateUserMonth, splitCompleters,
} from './engine';
import {
  buildDashboard, calculateChannelLTV, computeChannelFinancials, computeDynamicBEP,
  computeRunwayMetrics, equivalentMaintenanceBEP, firstReachedMonth,
  summarizeScenario, sustainableOperatingNet,
} from './metrics';
import {
  computeInventoryAssetValue, computeInventoryCashFlow,
  computeInventoryKpis, computeStockoutOpportunityCost,
} from './finance';
import {
  SNAPSHOT_BROWSER_CONSTANTS,
  SNAPSHOT_BROWSER_FUNCTIONS,
} from './snapshot';
import type { SandboxSnapshot, StandardizedSnapshot } from './snapshot';
import type { MonthResult } from './engine';
import type { ScenarioResult } from './metrics';
import type { SandboxInput, ScenarioKey } from './schema';

const ENGINE_FUNCTIONS = [
  monthlyRecurringBoxes, monthlyCustomerValue, rewardPerBox, channelUnitEconomics,
  settleCoachOrder, settleCoachRewards, emptyUserChannel, clampRatio,
  scenarioMultipliers, resolveUserRates, splitCompleters, addCompleterOutcomes,
  simulateUserMonth, runSeedMonth, applyQualification, isCoachCohortActive,
  simulate, calculateStaffCapacity, firstReachedMonth, sustainableOperatingNet,
  equivalentMaintenanceBEP, computeChannelFinancials, computeDynamicBEP,
  computeRunwayMetrics, buildCeoCharts, calculateChannelLTV, summarizeScenario, buildDashboard,
];

const FINANCE_FUNCTIONS = [
  computeInventoryAssetValue, computeStockoutOpportunityCost,
  computeInventoryCashFlow, computeInventoryKpis,
];

const SLIDERS = [
  { key: 'retention', label: '月度维持留存率', min: 0, max: 100, step: 'any', expr: "Number(this.value) + '%'" },
  { key: 'acquisition', label: '教练人均月新拓', min: 0, max: 20, step: 'any', expr: "Number(this.value) + ' 人'" },
  { key: 'candidate', label: '教练候选率', min: 0, max: 100, step: 'any', expr: "Number(this.value) + '%'" },
] as const;

const NUMBER_INPUTS = [
  { key: 'rent', label: '月度房租', unit: '元', min: 0, step: 'any', integer: false },
  { key: 'office', label: '行政办公', unit: '元', min: 0, step: 'any', integer: false },
  { key: 'staff', label: '初始员工数', unit: '人', min: 1, step: '1', integer: true },
  { key: 'salary', label: '员工月底薪', unit: '元', min: 0, step: 'any', integer: false },
  { key: 'seed1', label: '种子 1 期投放', unit: '人', min: 0, step: '1', integer: true },
  { key: 'seed2', label: '种子 2 期投放', unit: '人', min: 0, step: '1', integer: true },
] as const;

type BrowserControlRule = {
  id: string;
  path: string;
  label: string;
  group: string;
  kind: 'integer' | 'money' | 'percent' | 'multiplier';
  min: number;
  max?: number;
  exclusiveMin?: boolean;
};

declare const CONTROL_RULES: BrowserControlRule[];
declare const SLIDER_BINDINGS: Array<{ path: string; slider: string; input: string; output: string; suffix: string }>;
declare const state: any;
declare const activeSnapshotInput: any;
declare function scheduleRender(): void;

const INPUT_CONTROLS: Array<Omit<BrowserControlRule, 'id'>> = [
  { path: 'horizonMonths', label: '推演月数', group: '推演与产品', kind: 'integer', min: 1 },
  { path: 'product.boxPrice', label: '盒价（元）', group: '推演与产品', kind: 'money', min: 0, exclusiveMin: true },
  { path: 'product.bagsPerBox', label: '每盒袋数', group: '推演与产品', kind: 'integer', min: 1 },
  { path: 'product.bagsPerMonth', label: '每月袋数', group: '推演与产品', kind: 'integer', min: 1 },
  { path: 'product.firstPurchaseBoxes', label: '首购盒数', group: '推演与产品', kind: 'integer', min: 1 },
  { path: 'product.boxesPerCase', label: '每箱盒数', group: '推演与产品', kind: 'integer', min: 1 },
  { path: 'product.coachPurchasePrice', label: '教练拿货价（元）', group: '推演与产品', kind: 'money', min: 0, exclusiveMin: true },
  { path: 'product.unitCost', label: '产品成本（元）', group: '推演与产品', kind: 'money', min: 0, exclusiveMin: true },
  { path: 'seed.phase1.users', label: '种子 1 期投放（人）', group: '种子与用户', kind: 'integer', min: 0 },
  { path: 'seed.phase1.weekCompletionRate', label: '种子 1 期一周通过率（%）', group: '种子与用户', kind: 'percent', min: 0, max: 100 },
  { path: 'seed.phase1.finalPurchaseRate', label: '种子 1 期第 3 盒购买率（%）', group: '种子与用户', kind: 'percent', min: 0, max: 100 },
  { path: 'seed.phase2.users', label: '种子 2 期投放（人）', group: '种子与用户', kind: 'integer', min: 0 },
  { path: 'seed.phase2.checkInCompletionRate', label: '种子 2 期打卡通过率（%）', group: '种子与用户', kind: 'percent', min: 0, max: 100 },
  { path: 'seed.phase2.finalPurchaseRate', label: '种子 2 期第 3 盒购买率（%）', group: '种子与用户', kind: 'percent', min: 0, max: 100 },
  { path: 'users.directNewUsersPerMonth', label: '直营月新增用户', group: '种子与用户', kind: 'integer', min: 0 },
  { path: 'users.completionRate', label: '首购完赛率（%）', group: '种子与用户', kind: 'percent', min: 0, max: 100 },
  { path: 'users.extensionRate', label: '延伸分流率（%）', group: '种子与用户', kind: 'percent', min: 0, max: 100 },
  { path: 'users.maintenanceRate', label: '维持分流率（%）', group: '种子与用户', kind: 'percent', min: 0, max: 100 },
  { path: 'users.churnRate', label: '流失率（%）', group: '种子与用户', kind: 'percent', min: 0, max: 100 },
  { path: 'users.monthlyRetention', label: '月度维持留存率（%）', group: '种子与用户', kind: 'percent', min: 0, max: 100 },
  { path: 'coaches.initialCandidates', label: '初始候选数', group: '教练政策', kind: 'integer', min: 0 },
  { path: 'coaches.initialSupportRecords', label: '初始扶持记录', group: '教练政策', kind: 'integer', min: 0 },
  { path: 'coaches.validRecordRate', label: '有效打卡率（%）', group: '教练政策', kind: 'percent', min: 0, max: 100 },
  { path: 'coaches.candidateRate', label: '教练候选率（%）', group: '教练政策', kind: 'percent', min: 0, max: 100 },
  { path: 'coaches.supportCompletionRate', label: '扶持完赛率（%）', group: '教练政策', kind: 'percent', min: 0, max: 100 },
  { path: 'coaches.requiredRecordedDays', label: '要求记录天数', group: '教练政策', kind: 'integer', min: 0, max: 21 },
  { path: 'coaches.supportUsersRequired', label: '每名教练扶持人数', group: '教练政策', kind: 'integer', min: 1 },
  { path: 'coaches.activeNewPaidUsers', label: '活跃新客边界', group: '教练政策', kind: 'integer', min: 1 },
  { path: 'coaches.monthlyNewUsersPerCoach', label: '教练人均月新拓', group: '教练政策', kind: 'integer', min: 0 },
  { path: 'coaches.dataRewardRate', label: '数据奖励率（%）', group: '教练政策', kind: 'percent', min: 0, max: 100 },
  { path: 'coaches.referralRewardRate', label: '裂变奖励率（%）', group: '教练政策', kind: 'percent', min: 0, max: 100 },
  { path: 'coaches.dataRewardEligibleRate', label: '数据奖励达标率（%）', group: '教练政策', kind: 'percent', min: 0, max: 100 },
  { path: 'coaches.referralRewardEligibleRate', label: '裂变奖励达标率（%）', group: '教练政策', kind: 'percent', min: 0, max: 100 },
  { path: 'coaches.rewardOffsetRate', label: '奖励抵扣比例（%）', group: '教练政策', kind: 'percent', min: 0, max: 100 },
  { path: 'coaches.restockPoint', label: '补货点（盒）', group: '教练政策', kind: 'integer', min: 0 },
  { path: 'staff.initialCount', label: '初始员工数', group: '员工与财务', kind: 'integer', min: 1 },
  { path: 'staff.monthlySalary', label: '员工月底薪（元）', group: '员工与财务', kind: 'money', min: 0 },
  { path: 'staff.coachesPerStaff', label: '每员工教练容量', group: '员工与财务', kind: 'integer', min: 1 },
  { path: 'staff.usersPerStaff', label: '每员工用户容量', group: '员工与财务', kind: 'integer', min: 1 },
  { path: 'finance.initialCash', label: '初始现金（元）', group: '员工与财务', kind: 'money', min: 0 },
  { path: 'finance.rent', label: '月度房租（元）', group: '员工与财务', kind: 'money', min: 0 },
  { path: 'finance.monthlyOffice', label: '月度办公（元）', group: '员工与财务', kind: 'money', min: 0 },
  { path: 'finance.otherFixedCosts', label: '其他固定成本（元）', group: '员工与财务', kind: 'money', min: 0 },
  { path: 'finance.deposit', label: '押金（元）', group: '员工与财务', kind: 'money', min: 0 },
  { path: 'finance.setupFee', label: '开办费（元）', group: '员工与财务', kind: 'money', min: 0 },
  { path: 'finance.overheadRate', label: '动态平摊率（%）', group: '员工与财务', kind: 'percent', min: 0, max: 100 },
  { path: 'finance.staffPerformanceRate', label: '员工绩效率（%）', group: '员工与财务', kind: 'percent', min: 0, max: 100 },
  { path: 'finance.incubationReward', label: '孵化奖（元）', group: '员工与财务', kind: 'money', min: 0 },
  { path: 'scenarios.stress.multipliers.completion', label: '压力·完赛系数', group: '场景系数与假设库存', kind: 'multiplier', min: 0 },
  { path: 'scenarios.stress.multipliers.retention', label: '压力·留存系数', group: '场景系数与假设库存', kind: 'multiplier', min: 0 },
  { path: 'scenarios.stress.multipliers.acquisition', label: '压力·新拓系数', group: '场景系数与假设库存', kind: 'multiplier', min: 0 },
  { path: 'scenarios.stress.multipliers.qualification', label: '压力·资格转化系数', group: '场景系数与假设库存', kind: 'multiplier', min: 0 },
  { path: 'scenarios.upside.multipliers.completion', label: '进取·完赛系数', group: '场景系数与假设库存', kind: 'multiplier', min: 0 },
  { path: 'scenarios.upside.multipliers.retention', label: '进取·留存系数', group: '场景系数与假设库存', kind: 'multiplier', min: 0 },
  { path: 'scenarios.upside.multipliers.acquisition', label: '进取·新拓系数', group: '场景系数与假设库存', kind: 'multiplier', min: 0 },
  { path: 'scenarios.upside.multipliers.qualification', label: '进取·资格转化系数', group: '场景系数与假设库存', kind: 'multiplier', min: 0 },
  { path: 'platformStockBoxes', label: '平台假设库存（盒）', group: '场景系数与假设库存', kind: 'integer', min: 0 },
];

const FLOW_PATHS = ['users.extensionRate', 'users.maintenanceRate', 'users.churnRate'];
const LEGACY_CONTROL_PATHS = new Set([
  'finance.rent', 'finance.monthlyOffice', 'staff.initialCount',
  'staff.monthlySalary', 'seed.phase1.users', 'seed.phase2.users',
]);
const DEFAULT_PLATFORM_STOCK_BOXES = 200;

function controlId(path: string): string {
  const legacyIds: Record<string, string> = {
    'finance.rent': 'ci-rent',
    'finance.monthlyOffice': 'ci-office',
    'staff.initialCount': 'ci-staff',
    'staff.monthlySalary': 'ci-salary',
    'seed.phase1.users': 'ci-seed1',
    'seed.phase2.users': 'ci-seed2',
    'users.monthlyRetention': 'ci-retention',
    'coaches.monthlyNewUsersPerCoach': 'ci-acquisition',
    'coaches.candidateRate': 'ci-candidate',
  };
  return legacyIds[path] ?? `ci-${path.replace(/\./g, '-')}`;
}

export function toDisplayPercent(stored: number): number {
  return stored * 100;
}

export function toStoredPercent(display: number): number {
  return display / 100;
}

export function isValidMoney(s: string): boolean {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(s)) return false;
  const decimalIndex = s.indexOf('.');
  const whole = decimalIndex === -1 ? s : s.slice(0, decimalIndex);
  const fraction = decimalIndex === -1 ? '' : s.slice(decimalIndex + 1);
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0') || 0);
  return Number.isSafeInteger(minor);
}

function parseObjectPath(path: string): string[] {
  if (!/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/.test(path)) throw new Error('非法路径：' + path);
  const keys = path.match(/[^.]+/g) ?? [];
  for (const key of keys) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      throw new Error('危险路径：' + path);
    }
  }
  return keys;
}

function readInputPath(input: SandboxInput, path: string): number {
  return readObjectPath(input, path) as number;
}

function parseControlValue(raw: string, min: number, integer: boolean): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) return null;
  return value;
}

function parseAssumptionValue(raw: string, rule: BrowserControlRule) {
  const normalized = raw.trim();
  if (normalized === '') return { value: null, error: '请输入数值，不能留空。' };
  if (rule.kind === 'money') {
    if (!isValidMoney(normalized)) {
      return { value: null, error: '金额必须使用非负普通十进制数字，最多保留两位小数，且换算到分必须是安全整数。' };
    }
  } else if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return { value: null, error: '必须使用普通十进制数字，不支持科学计数法或其他格式。' };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { value: null, error: '输入必须是有限数值。' };
  if (rule.kind === 'integer' && !Number.isSafeInteger(value)) {
    return { value: null, error: '计数字段必须是安全整数，不能包含小数或超出安全整数范围。' };
  }
  if (value < rule.min || (rule.exclusiveMin === true && value === rule.min)) {
    return { value: null, error: rule.exclusiveMin === true ? `输入必须大于 ${rule.min}。` : `输入不能小于 ${rule.min}。` };
  }
  if (rule.max !== undefined && value > rule.max) {
    const message = rule.kind === 'percent' ? '百分比必须在 0—100 之间。' : `输入不能大于 ${rule.max}。`;
    return { value: null, error: message };
  }
  return { value, error: '' };
}

function readObjectPath(object: any, path: string): any {
  const keys = parseObjectPath(path);
  return keys.reduce((value, key) => value[key], object);
}

function writeObjectPath(object: any, path: string, value: number): void {
  const keys = parseObjectPath(path);
  const last = keys.pop() as string;
  const target = keys.reduce((current, key) => current[key], object);
  target[last] = value;
}

function findControlRule(path: string): BrowserControlRule {
  for (const rule of CONTROL_RULES) if (rule.path === path) return rule;
  throw new Error('未知经营假设字段：' + path);
}

function isSnapshotProtectedPath(path: string): boolean {
  return path === 'platformStockBoxes' || path === 'product.unitCost' ||
    path === 'product.coachPurchasePrice' || path === 'product.boxPrice';
}

function setControlError(input: any, message: string): void {
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  const errorId = input.getAttribute('aria-describedby');
  if (errorId) (document.getElementById(errorId) as any).textContent = message;
}

function currentControlNumber(path: string): number {
  if (path === 'platformStockBoxes') return state.platformStockBoxes;
  if (state.dataMode === 'actual' && activeSnapshotInput && isSnapshotProtectedPath(path)) {
    if (path === 'product.unitCost' && Number.isFinite(activeSnapshotInput.unitCost)) return activeSnapshotInput.unitCost;
    if (path === 'product.coachPurchasePrice' && Number.isFinite(activeSnapshotInput.coachPickupPrice)) return activeSnapshotInput.coachPickupPrice;
    if (path === 'product.boxPrice' && Number.isFinite(activeSnapshotInput.revenuePerBox)) return activeSnapshotInput.revenuePerBox;
  }
  const rule = findControlRule(path);
  const value = readObjectPath(state.values, path);
  return rule.kind === 'percent' ? toDisplayPercent(value) : value;
}

function syncLegacyState(path: string, value: number): void {
  if (path === 'users.monthlyRetention') state.retention = value;
  if (path === 'coaches.monthlyNewUsersPerCoach') state.acquisition = value;
  if (path === 'coaches.candidateRate') state.candidate = value;
  if (path === 'finance.rent') state.rent = value;
  if (path === 'finance.monthlyOffice') state.office = value;
  if (path === 'staff.initialCount') state.staff = value;
  if (path === 'staff.monthlySalary') state.salary = value;
  if (path === 'seed.phase1.users') state.seed1 = value;
  if (path === 'seed.phase2.users') state.seed2 = value;
}

function syncPairedControl(path: string, raw: string, source: string): void {
  for (const binding of SLIDER_BINDINGS) {
    if (binding.path !== path) continue;
    const slider = document.getElementById(binding.slider) as any;
    const input = document.getElementById(binding.input) as any;
    const output = document.getElementById(binding.output) as any;
    if (source !== 'slider') slider.value = raw;
    if (source !== 'number') input.value = raw;
    output.textContent = Number(raw) + binding.suffix;
  }
}

function commitNumericPath(path: string, raw: string, source: string): boolean {
  const rule = findControlRule(path);
  const input = document.getElementById(rule.id) as any;
  if (state.dataMode === 'actual' && isSnapshotProtectedPath(path)) {
    input.value = String(currentControlNumber(path));
    return false;
  }
  const parsed = parseAssumptionValue(raw, rule);
  if (parsed.value === null) {
    setControlError(input, parsed.error);
    return false;
  }
  const stored = rule.kind === 'percent' ? toStoredPercent(parsed.value) : parsed.value;
  if (path === 'platformStockBoxes') {
    state.platformStockBoxes = stored;
    state.assumptionPlatformStockBoxes = stored;
  } else {
    writeObjectPath(state.values, path, stored);
  }
  syncLegacyState(path, rule.kind === 'percent' ? parsed.value : stored);
  setControlError(input, '');
  syncPairedControl(path, raw, source);
  scheduleRender();
  return true;
}

function updateFlowDraft(path: string, raw: string): void {
  const rule = findControlRule(path);
  const input = document.getElementById(rule.id) as any;
  const parsed = parseAssumptionValue(raw, rule);
  if (parsed.value === null) {
    setControlError(input, parsed.error);
    return;
  }
  const key = parseObjectPath(path).pop() as string;
  state.flowDraft[key] = parsed.value;
  setControlError(input, '');
}

function applyFlowRates(): void {
  const paths = ['users.extensionRate', 'users.maintenanceRate', 'users.churnRate'];
  const values = [];
  let valid = true;
  for (const path of paths) {
    const rule = findControlRule(path);
    const input = document.getElementById(rule.id) as any;
    const parsed = parseAssumptionValue(input.value, rule);
    if (parsed.value === null) {
      setControlError(input, parsed.error);
      valid = false;
    } else {
      values.push(parsed.value);
      setControlError(input, '');
    }
  }
  if (!valid) return;
  const storedValues = values.map((value) => toStoredPercent(value));
  const sum = storedValues[0] + storedValues[1] + storedValues[2];
  if (Math.abs(sum - 1) > 1e-9) {
    for (const path of paths) {
      const rule = findControlRule(path);
      setControlError(document.getElementById(rule.id) as any, '延伸、维持和流失分流率合计必须等于 100%。');
    }
    return;
  }
  for (let index = 0; index < paths.length; index++) {
    writeObjectPath(state.values, paths[index], storedValues[index]);
    state.flowDraft[parseObjectPath(paths[index]).pop() as string] = values[index];
  }
  scheduleRender();
}

function applyModeProtection(): void {
  for (const rule of CONTROL_RULES) {
    const input = document.getElementById(rule.id) as any;
    const locked = state.dataMode === 'actual' && isSnapshotProtectedPath(rule.path);
    input.readOnly = locked;
    input.setAttribute('aria-readonly', locked ? 'true' : 'false');
    input.value = String(currentControlNumber(rule.path));
  }
}

function resolveInventoryKpiParams(
  mode: 'actual' | 'assumption',
  snapshot: StandardizedSnapshot | null,
  platformStockBoxes: number,
  month: Pick<MonthResult, 'coachOrderBoxes' | 'shortageBoxes'>,
  product: SandboxInput['product']
) {
  const actual = mode === 'actual';
  return {
    platformStockBoxes,
    coachPickupBoxes: actual ? snapshot?.coachPickupBoxes : month.coachOrderBoxes,
    stockoutBoxes: actual ? snapshot?.stockoutBoxes : month.shortageBoxes,
    unitCost: actual ? snapshot?.unitCost : product.unitCost,
    coachPickupPrice: actual ? snapshot?.coachPickupPrice : product.coachPurchasePrice,
    revenuePerBox: actual ? snapshot?.revenuePerBox : product.boxPrice,
  };
}

function buildCeoCharts(months: MonthResult[], input: SandboxInput, cashWarningLine: number) {
  // 当前快照契约不含双渠道财务历史，三类图表只能标记为模拟预测。
  const channelResults = months.map(function (month) {
    return computeChannelFinancials(month, input);
  });
  const channelFinancials = months.map(function (month, index) {
    const channelResult = channelResults[index];
    return {
      month: month.month,
      directRevenue: channelResult.direct.confirmedRevenue,
      coachRevenue: channelResult.coach.confirmedRevenue,
      directProductCost: channelResult.direct.productCost,
      coachProductCost: channelResult.coach.productCost,
      directCommon: channelResult.directCommon,
      coachCommon: channelResult.coachCommon,
      directOperatingNet: channelResult.direct.operatingNet,
      coachOperatingNet: channelResult.coach.operatingNet,
      unallocatedCommonCosts: channelResult.unallocatedCommonCosts,
      isActual: false,
      isForecast: true,
    };
  });
  const dynamicBEP = months.map(function (month, index) {
    const channelResult = channelResults[index];
    return {
      month: month.month,
      users: computeDynamicBEP(month, input, channelResult),
      isActual: false,
      isForecast: true,
    };
  });
  const runway = computeRunwayMetrics(months, cashWarningLine);
  return {
    channelFinancials,
    dynamicBEP,
    cashRunway: {
      points: months.map(function (month) {
        return {
          month: month.month,
          cashBalance: month.cashBalance,
          cashWarningLine,
          isActual: false,
          isForecast: true,
        };
      }),
      maxOperatingLoss: runway.maxOperatingLoss,
      maxOperatingLossMonth: runway.maxOperatingLossMonth,
      maxCashGap: runway.maxCashGap,
      runway: runway.runway,
      runwayLabel: runway.runway === null
        ? '超过推演期'
        : runway.runway === 0 ? '期初已触线' : '第 ' + runway.runway + ' 月触线',
    },
  };
}

export function generateReport(
  input: SandboxInput,
  snapshots: SandboxSnapshot[] = [],
  cashWarningLine = 0,
): string {
  const initialDashboard = buildDashboard(input);
  const cleanBrowserJs = (source: string) => source.replace(
    new RegExp('\\b' + 'imp' + 'ort_[A-Za-z0-9_$]+\\.', 'g'), '',
  );
  const engineJs = cleanBrowserJs([...ENGINE_FUNCTIONS, parseControlValue]
    .map((fn) => fn.toString())
    .join('\n'));
  const inputJs = cleanBrowserJs([
    toDisplayPercent, toStoredPercent, isValidMoney, parseAssumptionValue,
    parseObjectPath, readObjectPath, writeObjectPath, findControlRule,
    isSnapshotProtectedPath, setControlError, currentControlNumber, syncLegacyState,
    syncPairedControl, commitNumericPath, updateFlowDraft, applyFlowRates, applyModeProtection,
  ].map((fn) => fn.toString()).join('\n'));
  const financeJs = FINANCE_FUNCTIONS.map((fn) => fn.toString()).join('\n');
  const snapshotJs = `/* SNAPSHOT_BROWSER_BEGIN */
/* SNAPSHOT_BROWSER_FUNCTIONS */
const TOP_LEVEL_FIELDS = ${JSON.stringify(SNAPSHOT_BROWSER_CONSTANTS.TOP_LEVEL_FIELDS)};
const SENSITIVE_KEYS = new Set(${JSON.stringify(SNAPSHOT_BROWSER_CONSTANTS.SENSITIVE_KEYS)});
${SNAPSHOT_BROWSER_FUNCTIONS.map((fn) => fn.toString()).join('\n')}
/* SNAPSHOT_BROWSER_END */`;
  const platformStockBoxes = DEFAULT_PLATFORM_STOCK_BOXES;
  const initialMonths = initialDashboard.scenarios.baseline.months;
  const initialLast = initialMonths[initialMonths.length - 1];
  const initialInventoryKpis = computeInventoryKpis({
    platformStockBoxes,
    coachPickupBoxes: initialLast.coachOrderBoxes,
    stockoutBoxes: initialLast.shortageBoxes,
    unitCost: input.product.unitCost,
    revenuePerBox: input.product.boxPrice,
    coachPickupPrice: input.product.coachPurchasePrice,
  });
  const state = {
    retention: toDisplayPercent(input.users.monthlyRetention),
    acquisition: input.coaches.monthlyNewUsersPerCoach,
    candidate: toDisplayPercent(input.coaches.candidateRate),
    rent: input.finance.rent,
    office: input.finance.monthlyOffice,
    staff: input.staff.initialCount,
    salary: input.staff.monthlySalary,
    seed1: input.seed.phase1.users,
    seed2: input.seed.phase2.users,
    values: input,
    flowDraft: {
      extensionRate: toDisplayPercent(input.users.extensionRate),
      maintenanceRate: toDisplayPercent(input.users.maintenanceRate),
      churnRate: toDisplayPercent(input.users.churnRate),
    },
    platformStockBoxes,
    assumptionPlatformStockBoxes: platformStockBoxes,
    cashWarningLine,
    dataMode: 'assumption' as 'actual' | 'assumption',
    scenario: 'baseline' as ScenarioKey,
  };
  const autoExpandControl = `<label class="control boolean-control"><span>员工自动扩编</span>
    <input type="checkbox" id="ci-staff-autoExpand" data-input-path="staff.autoExpand" ${input.staff.autoExpand ? 'checked' : ''} />
    <span>开启后按容量缺口自动扩编</span></label>`;
  const flowApplyButton = `<button type="button" class="snapshot-action" id="apply-flow-rates">校验并应用三项分流率（合计须为 100%）</button>`;
  const groups = [...new Set(INPUT_CONTROLS.map((control) => control.group))];
  const assumptionPanels = groups.map((group) => {
    const controls = INPUT_CONTROLS.filter((control) => control.group === group).map((control) => {
      const id = controlId(control.path);
      const rawValue = control.path === 'platformStockBoxes' ? platformStockBoxes : readInputPath(input, control.path);
      const displayValue = control.kind === 'percent' ? toDisplayPercent(rawValue) : rawValue;
      return `<label class="control" for="${id}"><span>${control.label}</span><span class="number-wrap">
        <input type="text" inputmode="${control.kind === 'integer' ? 'numeric' : 'decimal'}" id="${id}" data-input-path="${control.path}" value="${displayValue}" aria-invalid="false" aria-describedby="error-${id}" />
      </span><small class="control-error" id="error-${id}" role="alert" aria-live="polite"></small></label>`;
    }).join('');
    return `<section class="panel"><h2>${group}</h2><div class="controls">${controls}</div>
      ${group === '种子与用户' ? flowApplyButton : ''}${group === '员工与财务' ? autoExpandControl : ''}</section>`;
  }).join('');
  const legacyNumberContract = `<!-- 旧静态控件契约保留为非渲染标记：\n${NUMBER_INPUTS.map((control) => `
    <input type="number" id="ci-${control.key}" value="${state[control.key]}" min="${control.min}" step="${control.step}" />`).join('\n')}\n-->`;
  const sliderControls = SLIDERS.map((control) => {
    const max = control.key === 'acquisition' ? Math.max(control.max, state.acquisition) : control.max;
    return `
    <label class="slider"><span>${control.label}</span><output id="val-${control.key}"></output>
      <input type="range" id="sl-${control.key}" min="${control.min}" max="${max}" step="${control.step}" value="${state[control.key]}" />
    </label>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>菌衡计划 V7.1 · CEO 经营驾驶舱</title>
<style>
:root{--bg:#0b1110;--panel:#131c1a;--line:#2a3935;--text:#edf5f1;--muted:#93a69f;--green:#9ddd70;--red:#ff786f;--blue:#72b7ff;--amber:#f2bc68}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 -apple-system,"PingFang SC",sans-serif}main{max-width:1440px;margin:auto;padding:28px 18px 60px}h1{font-size:25px;margin:0}h2{font-size:16px;margin:0 0 16px}p{color:var(--muted)}.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;margin:16px 0}.controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.control,.slider{display:flex;flex-direction:column;gap:6px;color:var(--muted)}.number-wrap{display:flex;align-items:center;background:var(--bg);padding:7px 10px;border-radius:8px}.number-wrap input{width:100%;border:0;background:transparent;color:var(--green);font:inherit}.number-wrap em{font-style:normal}.slider output{float:right;color:var(--green)}.slider input{width:100%;accent-color:var(--green)}.scenarios{display:flex;gap:8px;margin:16px 0}.scenarios button,.snapshot-action{border:1px solid var(--line);background:var(--panel);color:var(--text);padding:8px 18px;border-radius:20px;cursor:pointer}.scenarios button.active{background:var(--green);color:#10200f}.snapshot-layout{display:grid;gap:12px}.snapshot-layout textarea{min-height:140px;resize:vertical;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:12px;font:12px/1.5 monospace}.snapshot-layout input[type=file]{color:var(--muted)}#snapshot-status{margin:0;color:var(--green)}#snapshot-status.error{color:var(--red)}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.kpi{padding:16px;background:var(--panel);border:1px solid var(--line);border-radius:12px}.kpi strong{display:block;font-size:24px;color:var(--green);margin:6px 0}.kpi small{color:var(--muted)}.delta{font-size:12px;color:var(--blue)}.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:12px}.chart svg{width:100%;height:auto}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}th{color:var(--muted)}nav{display:flex;gap:16px;flex-wrap:wrap}nav a{color:var(--blue)}pre{white-space:pre-wrap;color:var(--muted);font-size:12px}.warn{color:var(--red)}
</style></head><body><main>
<header><h1>菌衡计划 V7.1 · CEO 经营驾驶舱</h1><p>${input.horizonMonths} 个月月度 cohort ｜ 双渠道经济 ｜ 所有数字由输入实时推导</p></header>
<section class="panel" id="snapshot-import"><h2>经营快照导入</h2><div class="snapshot-layout">
<div class="scenarios"><button type="button" data-data-mode="assumption" class="active">假设模式</button><button type="button" data-data-mode="actual">实际模式</button></div>
<input type="file" id="snapshot-file" accept=".json,application/json" aria-label="上传 JSON 经营快照" />
<textarea id="snapshot-json" placeholder="粘贴 Sandbox Snapshot JSON；导入前会在本地完成契约与库存勾稽校验"></textarea>
<button type="button" class="snapshot-action" id="import-snapshot">校验并导入快照</button>
<p id="snapshot-status" role="status" aria-live="polite">假设模式：200 盒仅为默认经营假设，不是平台真实库存。</p>
</div></section>
${legacyNumberContract}
${assumptionPanels}
<section class="panel"><h2>滑块联动</h2><div class="controls">${sliderControls}</div></section>
<div class="scenarios"><button class="active" data-scenario="baseline">基准</button><button data-scenario="stress">压力</button><button data-scenario="upside">进取</button></div>
<section id="kpis" class="kpis"></section>
<section class="charts">
  <div class="panel chart"><h2>现金余额与最低点</h2><div id="cash-chart"></div></div>
  <div class="panel chart"><h2>平台经营净额</h2><div id="operating-chart"></div></div>
  <div class="panel chart"><h2>活跃／休眠教练</h2><div id="coach-chart"></div></div>
  <div class="panel chart"><h2>教练库存与缺货</h2><div id="inventory-chart"></div></div>
  <div class="panel chart"><h2>员工容量利用率</h2><div id="capacity-chart"></div></div>
  <div class="panel chart"><h2>双渠道财务对比</h2><div id="channel-financials-chart"></div></div>
  <div class="panel chart"><h2>动态 BEP 趋势</h2><div id="dynamic-bep-chart"></div></div>
  <div class="panel chart"><h2>Runway 现金与警戒线</h2><div id="runway-cash-chart"></div></div>
</section>
<section class="panel"><nav><a href="#users-drilldown">用户增长与分流</a><a href="#coaches-drilldown">教练准入与休眠</a><a href="#finance-drilldown">库存分润与平台损益</a><a href="#staff-drilldown">员工容量与扩编</a></nav></section>
<section id="users-drilldown" class="panel"><h2>用户增长与分流</h2><div id="users-table"></div><div id="ltv"></div></section>
<section id="coaches-drilldown" class="panel"><h2>教练准入与休眠</h2><div id="coaches-table"></div></section>
<section id="finance-drilldown" class="panel"><h2>库存分润与平台损益</h2><div id="finance-table"></div></section>
<section id="staff-drilldown" class="panel"><h2>员工容量与扩编</h2><div id="staff-table"></div></section>
<section class="panel"><h2>月度审计明细</h2><div id="audit-table"></div><h2>公式说明</h2><p>月复购盒数＝每月袋数÷每盒袋数；validRecordRate 是已达到 requiredRecordedDays 要求的聚合占比，场景系数只调整候选、不调整扶持记录；教练容量按当月服务教练及其用户计算，包含月末新休眠、次月才托管的队列；教练拿货收入与终端 GMV 分列；持续经营净额剔除新教练首箱拿货贡献；奖励抵扣只影响现金与负债；未达月份显示「未达到」。</p><h2>输入快照</h2><pre id="input-snapshot"></pre></section>
<footer>本地经营沙盘，不构成收益或经营结果承诺。</footer>
</main><script>
'use strict';
function __name(fn, name) {
  try { Object.defineProperty(fn, 'name', { value: name, configurable: true }); } catch (e) {}
  return fn;
}
${engineJs}
${inputJs}
${financeJs}
${snapshotJs}
${resolveInventoryKpiParams.toString()}
const BASE_INPUT = ${JSON.stringify(input)};
const CONTROL_RULES = ${JSON.stringify(INPUT_CONTROLS.map((control) => ({ ...control, id: controlId(control.path) })))};
const SLIDER_BINDINGS = ${JSON.stringify([
    { path: 'users.monthlyRetention', slider: 'sl-retention', input: 'ci-retention', output: 'val-retention', suffix: '%' },
    { path: 'coaches.monthlyNewUsersPerCoach', slider: 'sl-acquisition', input: 'ci-acquisition', output: 'val-acquisition', suffix: ' 人' },
    { path: 'coaches.candidateRate', slider: 'sl-candidate', input: 'ci-candidate', output: 'val-candidate', suffix: '%' },
  ])};
const INITIAL_DASHBOARD = ${JSON.stringify(initialDashboard)};
const INITIAL_INVENTORY_KPIS = ${JSON.stringify(initialInventoryKpis)};
const INITIAL_CEO_CHARTS = ${JSON.stringify(buildCeoCharts(initialMonths, input, cashWarningLine))};
const state = ${JSON.stringify(state)};
let dashboard = INITIAL_DASHBOARD;
let inventoryKpis = INITIAL_INVENTORY_KPIS;
let ceoCharts = INITIAL_CEO_CHARTS;
const snapshotImporter = createSnapshotImporter();
const snapshotFile = document.getElementById('snapshot-file');
const snapshotJson = document.getElementById('snapshot-json');
const snapshotStatus = document.getElementById('snapshot-status');
const importButton = document.getElementById('import-snapshot');
let activeSnapshot = null;
let activeSnapshotInput = null;
const snapshotHistory = ${JSON.stringify(snapshots)};
function setSnapshotStatus(message, isError) {
  snapshotStatus.textContent = message;
  snapshotStatus.className = isError ? 'error' : '';
}
function updateDataModeButtons() {
  document.querySelectorAll('[data-data-mode]').forEach(function (button) {
    button.classList.toggle('active', button.getAttribute('data-data-mode') === state.dataMode);
  });
}
function syncActiveSnapshot() {
  const resolved = resolveActualSnapshots(snapshotHistory);
  activeSnapshot = resolved.snapshots.length > 0 ? resolved.snapshots[resolved.snapshots.length - 1] : null;
  activeSnapshotInput = activeSnapshot ? standardizeSnapshot(activeSnapshot) : null;
  if (state.dataMode === 'actual') {
    state.platformStockBoxes = activeSnapshotInput ? activeSnapshotInput.platformStockBoxes : 0;
  }
  return resolved.conflicts;
}
function setDataMode(mode) {
  if (mode === 'actual') {
    syncActiveSnapshot();
    if (activeSnapshotInput === null) {
      setSnapshotStatus('导入失败：实际模式需要先导入通过校验且无冲突的快照，不会回退到 200 盒。', true);
      return;
    }
  }
  state.dataMode = mode;
  state.platformStockBoxes = mode === 'actual' ? activeSnapshotInput.platformStockBoxes : state.assumptionPlatformStockBoxes;
  updateDataModeButtons();
  applyModeProtection();
  scheduleRender();
}
function importSnapshotFromText(raw) {
  try {
    const imported = snapshotImporter.importJson(raw);
    state.dataMode = imported.source.dataMode;
    let conflicts = [];
    if (state.dataMode === 'actual') {
      if (!snapshotHistory.some(function (snapshot) { return snapshot.snapshotId === imported.snapshotId; })) {
        snapshotHistory.push(imported);
      }
      conflicts = syncActiveSnapshot();
    } else {
      activeSnapshot = imported;
      activeSnapshotInput = standardizeSnapshot(imported);
      state.platformStockBoxes = activeSnapshotInput.platformStockBoxes;
      state.assumptionPlatformStockBoxes = activeSnapshotInput.platformStockBoxes;
    }
    updateDataModeButtons();
    applyModeProtection();
    render();
    if (conflicts.length > 0) {
      setSnapshotStatus('同期快照冲突：' + conflicts.join('、') + '。请导入具有明确替代关系的修正快照。', true);
    } else {
      setSnapshotStatus('导入成功：' + imported.snapshotId + '；来源修订 ' + imported.sourceRevision + '；当前为' + (state.dataMode === 'actual' ? '实际模式' : '假设模式') + '。', false);
    }
  } catch (error) {
    const code = error && typeof error.code === 'string' ? error.code : 'INVALID_JSON';
    const message = error && typeof error.message === 'string' ? error.message : '无法读取快照';
    setSnapshotStatus('导入失败 [' + code + ']：' + message, true);
  }
}
snapshotFile.addEventListener('change', function () {
  const file = snapshotFile.files && snapshotFile.files[0];
  if (!file) return;
  file.text().then(function (raw) {
    snapshotJson.value = raw;
    importSnapshotFromText(raw);
  }).catch(function () {
    setSnapshotStatus('导入失败：无法读取所选文件。', true);
  });
});
importButton.addEventListener('click', function () {
  importSnapshotFromText(snapshotJson.value);
});
document.querySelectorAll('[data-data-mode]').forEach(function (button) {
  button.addEventListener('click', function () {
    setDataMode(button.getAttribute('data-data-mode'));
  });
});
function currentInput() {
  const input = JSON.parse(JSON.stringify(state.values));
  if (state.dataMode === 'actual' && activeSnapshotInput) {
    if (Number.isFinite(activeSnapshotInput.unitCost)) input.product.unitCost = activeSnapshotInput.unitCost;
    if (Number.isFinite(activeSnapshotInput.coachPickupPrice)) input.product.coachPurchasePrice = activeSnapshotInput.coachPickupPrice;
    if (Number.isFinite(activeSnapshotInput.revenuePerBox)) input.product.boxPrice = activeSnapshotInput.revenuePerBox;
  }
  return input;
}
function money(n) { return Math.round(n).toLocaleString('zh-CN') + ' 元'; }
function moneyOrUnknown(n) { return Number.isFinite(n) ? money(n) : '未知'; }
function number(n) { return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 1 }); }
function month(n) { return n === null ? '未达到' : '第 ' + n + ' 月'; }
function delta(current, base, suffix) {
  const d = current - base;
  return '较基准 ' + (d >= 0 ? '+' : '') + number(d) + (suffix || '');
}
function monthDelta(current, base) {
  if (current === null && base === null) return '与基准均未达到';
  if (current === null) return '较基准变为未达到';
  if (base === null) return '较基准新达到';
  if (current === base) return '与基准一致';
  return '较基准 ' + (current < base ? '提前 ' : '推迟 ') + number(Math.abs(current - base)) + ' 月';
}
function userTotal(m, key) {
  let total = m.direct[key];
  for (const coach of m.coachMonths) total += coach.users[key];
  return total;
}
function table(headers, rows) {
  let html = '<div class="table-wrap"><table><thead><tr>';
  for (const h of headers) html += '<th>' + h + '</th>';
  html += '</tr></thead><tbody>';
  for (const row of rows) {
    html += '<tr>';
    for (const cell of row) html += '<td>' + cell + '</td>';
    html += '</tr>';
  }
  return html + '</tbody></table></div>';
}
function buildChart(months, series) {
  const W = 620, H = 240, P = 38;
  let min = 0, max = 1;
  for (const item of series) for (const m of months) {
    min = Math.min(min, item.value(m));
    max = Math.max(max, item.value(m));
  }
  const span = max - min || 1;
  function x(i) { return P + i * (W - P * 2) / Math.max(1, months.length - 1); }
  function y(v) { return H - P - (v - min) * (H - P * 2) / span; }
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">';
  svg += '<line x1="' + P + '" y1="' + y(0) + '" x2="' + (W - P) + '" y2="' + y(0) + '" stroke="#2a3935"/>';
  for (const item of series) {
    let points = '';
    let minimumIndex = 0;
    for (let i = 0; i < months.length; i++) {
      points += x(i) + ',' + y(item.value(months[i])) + ' ';
      if (item.value(months[i]) < item.value(months[minimumIndex])) minimumIndex = i;
    }
    svg += '<polyline points="' + points + '" fill="none" stroke="' + item.color + '" stroke-width="2.5"/>';
    if (item.markMinimum) {
      svg += '<circle cx="' + x(minimumIndex) + '" cy="' + y(item.value(months[minimumIndex])) + '" r="5" fill="#0b1110" stroke="' + item.color + '" stroke-width="3"/>';
    }
  }
  svg += '<text x="' + P + '" y="18" fill="#93a69f" font-size="11">' + number(max) + '</text>';
  svg += '<text x="' + P + '" y="' + (H - 8) + '" fill="#93a69f" font-size="11">' + number(min) + '</text></svg>';
  return svg;
}
function buildDualAxisChart(months, series) {
  const W = 620, H = 240, P = 38;
  const scales = { y: { min: 0, max: 1 }, y1: { min: 0, max: 1 } };
  for (const item of series) for (const m of months) {
    const scale = scales[item.axis];
    scale.min = Math.min(scale.min, item.value(m));
    scale.max = Math.max(scale.max, item.value(m));
  }
  function x(i) { return P + i * (W - P * 2) / Math.max(1, months.length - 1); }
  function y(v, axis) {
    const scale = scales[axis];
    return H - P - (v - scale.min) * (H - P * 2) / (scale.max - scale.min || 1);
  }
  let html = '<div>';
  for (const item of series) html += '<span style="color:' + item.color + ';margin-right:12px">● ' + item.label + '</span>';
  html += '</div><svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">';
  html += '<line x1="' + P + '" y1="' + y(0, 'y') + '" x2="' + (W - P) + '" y2="' + y(0, 'y') + '" stroke="#2a3935"/>';
  for (const item of series) {
    let points = '';
    for (let i = 0; i < months.length; i++) points += x(i) + ',' + y(item.value(months[i]), item.axis) + ' ';
    html += '<polyline data-axis="' + item.axis + '" points="' + points + '" fill="none" stroke="' + item.color + '" stroke-width="2.5"/>';
  }
  html += '<text x="' + P + '" y="18" fill="#93a69f" font-size="11">' + number(scales.y.max) + '</text>';
  html += '<text x="' + P + '" y="' + (H - 8) + '" fill="#93a69f" font-size="11">' + number(scales.y.min) + '</text>';
  html += '<text x="' + (W - P) + '" y="18" fill="#93a69f" font-size="11" text-anchor="end">' + number(scales.y1.max) + '</text>';
  html += '<text x="' + (W - P) + '" y="' + (H - 8) + '" fill="#93a69f" font-size="11" text-anchor="end">' + number(scales.y1.min) + '</text></svg>';
  return html;
}
function isChartNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
function buildCeoLineChart(points, series, warningLine) {
  const W = 620, H = 260, P = 44;
  let min = 0, max = 1;
  for (const point of points) for (const item of series) {
    const value = point[item.key];
    if (!isChartNumber(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (isChartNumber(warningLine)) {
    min = Math.min(min, warningLine);
    max = Math.max(max, warningLine);
  }
  function x(index) { return P + index * (W - P * 2) / Math.max(1, points.length - 1); }
  function y(value) { return H - P - (value - min) * (H - P * 2) / (max - min || 1); }
  let html = '<div>';
  for (const item of series) html += '<span style="color:' + item.color + ';margin-right:12px">● ' + item.label + '</span>';
  html += '</div><svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">';
  html += '<line x1="' + P + '" y1="' + y(0) + '" x2="' + (W - P) + '" y2="' + y(0) + '" stroke="#2a3935"/>';
  if (isChartNumber(warningLine)) {
    html += '<line data-cash-warning-line x1="' + P + '" y1="' + y(warningLine) + '" x2="' + (W - P) + '" y2="' + y(warningLine) + '" stroke="#ff786f" stroke-width="1.5" stroke-dasharray="3 4"/>';
    html += '<text x="' + (W - P) + '" y="' + (y(warningLine) - 6) + '" fill="#ff786f" font-size="10" text-anchor="end">现金警戒线 ' + number(warningLine) + '</text>';
  }
  for (const item of series) {
    let segment = [];
    let segmentKind = null;
    function flushSegment() {
      if (segment.length > 1) {
        const coordinates = segment.map(function (entry) { return x(entry.index) + ',' + y(entry.value); }).join(' ');
        html += '<polyline data-ceo-line="' + segmentKind + '" data-series-path="' + item.key + '" points="' + coordinates + '" fill="none" stroke="' + item.color + '" stroke-width="2.5"' + (segmentKind === 'forecast' ? ' stroke-dasharray="7 5"' : '') + '/>';
      }
      segment = [];
    }
    for (let index = 0; index <= points.length; index++) {
      const point = points[index];
      const value = point ? point[item.key] : null;
      const kind = point && point.isActual ? 'actual' : 'forecast';
      if (point && isChartNumber(value)) {
        if (segment.length > 0 && kind !== segmentKind) flushSegment();
        segmentKind = kind;
        segment.push({ index: index, value: value });
      } else {
        flushSegment();
      }
    }
  }
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const kind = point.isActual ? 'actual' : 'forecast';
    for (const item of series) {
      const value = point[item.key];
      if (!isChartNumber(value)) continue;
      html += '<circle data-ceo-point="' + kind + '" data-series="' + item.key + '" data-value="' + value + '" data-month="' + point.month + '" cx="' + x(index) + '" cy="' + y(value) + '" r="3.5" fill="#0b1110" stroke="' + item.color + '" stroke-width="2"><title>第 ' + point.month + ' 月；' + item.label + '：' + number(value) + '；' + (kind === 'actual' ? '实际' : '模拟预测') + '</title></circle>';
    }
  }
  html += '<text x="' + P + '" y="18" fill="#93a69f" font-size="11">' + number(max) + '</text>';
  html += '<text x="' + P + '" y="' + (H - 8) + '" fill="#93a69f" font-size="11">' + number(min) + '</text>';
  if (points.length > 0) {
    html += '<text x="' + P + '" y="' + (H - 22) + '" fill="#93a69f" font-size="10">第 ' + points[0].month + ' 月</text>';
    html += '<text x="' + (W - P) + '" y="' + (H - 22) + '" fill="#93a69f" font-size="10" text-anchor="end">第 ' + points[points.length - 1].month + ' 月</text>';
  }
  html += '</svg><p>实线＝实际历史；虚线＝模拟预测。当前快照不含实际财务历史，本图全部使用虚线。</p>';
  return html;
}
function renderCeoCharts(charts) {
  document.getElementById('channel-financials-chart').innerHTML = buildCeoLineChart(charts.channelFinancials, [
    { key: 'directRevenue', label: '直营确认收入', color: '#9ddd70' },
    { key: 'coachRevenue', label: '教练确认收入', color: '#72b7ff' },
    { key: 'directProductCost', label: '直营产品成本', color: '#ff786f' },
    { key: 'coachProductCost', label: '教练产品成本', color: '#f2bc68' },
    { key: 'directCommon', label: '直营公共分摊', color: '#c39bd3' },
    { key: 'coachCommon', label: '教练公共分摊', color: '#76d7c4' },
  ]);
  document.getElementById('dynamic-bep-chart').innerHTML = buildCeoLineChart(charts.dynamicBEP, [
    { key: 'users', label: '动态 BEP（人）', color: '#9ddd70' },
  ]);
  document.getElementById('runway-cash-chart').innerHTML = buildCeoLineChart(charts.cashRunway.points, [
    { key: 'cashBalance', label: '期末现金', color: '#72b7ff' },
  ], state.cashWarningLine) + '<p>最大单月经营亏损：' + money(charts.cashRunway.maxOperatingLoss) +
    (charts.cashRunway.maxOperatingLossMonth === null ? '（无经营亏损）' : '（第 ' + charts.cashRunway.maxOperatingLossMonth + ' 月）') +
    '；最大现金缺口：' + money(charts.cashRunway.maxCashGap) + '；Runway：<strong>' + charts.cashRunway.runwayLabel + '</strong></p>';
}
function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function resolveActualSnapshots(snapshots) {
  const unique = new Map();
  for (const snapshot of snapshots) {
    if (snapshot.source.dataMode === 'actual' && !unique.has(snapshot.snapshotId)) {
      unique.set(snapshot.snapshotId, snapshot);
    }
  }
  const groups = new Map();
  for (const snapshot of unique.values()) {
    const key = snapshot.periodStart + '|' + snapshot.periodEnd;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(snapshot);
  }
  const resolved = [];
  const conflicts = [];
  for (const group of groups.values()) {
    const byId = new Map(group.map(function (snapshot) { return [snapshot.snapshotId, snapshot]; }));
    const superseded = new Set();
    let conflict = false;
    for (const snapshot of group) {
      if (!snapshot.supersedesSnapshotId) continue;
      const parent = byId.get(snapshot.supersedesSnapshotId);
      if (!parent || parent.periodStart !== snapshot.periodStart || parent.periodEnd !== snapshot.periodEnd) {
        conflict = true;
      } else {
        superseded.add(parent.snapshotId);
      }
    }
    for (const snapshot of group) {
      const seen = new Set();
      let current = snapshot;
      while (current && current.supersedesSnapshotId) {
        if (seen.has(current.snapshotId)) {
          conflict = true;
          break;
        }
        seen.add(current.snapshotId);
        current = byId.get(current.supersedesSnapshotId);
      }
    }
    const heads = group.filter(function (snapshot) { return !superseded.has(snapshot.snapshotId); });
    if (conflict || heads.length !== 1) {
      conflicts.push(group[0].periodEnd);
    } else {
      resolved.push(heads[0]);
    }
  }
  resolved.sort(function (a, b) {
    if (a.periodEnd === b.periodEnd) return a.periodStart < b.periodStart ? -1 : 1;
    return a.periodEnd < b.periodEnd ? -1 : 1;
  });
  conflicts.sort();
  return { snapshots: resolved, conflicts: conflicts };
}
function buildActualInventoryPoints(snapshots) {
  const resolved = resolveActualSnapshots(snapshots);
  const points = resolved.snapshots.map(function (snapshot) {
    const unitCostMinor = snapshot.productPricing.unitCostMinor;
    return {
      kind: 'actual',
      snapshotId: snapshot.snapshotId,
      periodEnd: snapshot.periodEnd,
      coachClosingBoxes: snapshot.inventory.coachClosingBoxes === undefined ? null : snapshot.inventory.coachClosingBoxes,
      stockoutBoxes: snapshot.coachOrders.stockoutBoxes === undefined ? null : snapshot.coachOrders.stockoutBoxes,
      inventoryAssetValue: unitCostMinor === undefined ? null : computeInventoryAssetValue(snapshot.inventory.closingPlatformBoxes, unitCostMinor / 100),
    };
  });
  return { points: points, conflicts: resolved.conflicts };
}
function buildForecastInventoryPoints(months, product, platformStockBoxes) {
  return months.map(function (month) {
    return {
      kind: 'forecast',
      month: month.month,
      label: '模拟预测 第 ' + month.month + ' 月',
      coachClosingBoxes: month.coachInventory,
      stockoutBoxes: month.shortageBoxes,
      inventoryAssetValue: computeInventoryAssetValue(platformStockBoxes - month.coachOrderBoxes, product.unitCost),
    };
  });
}
function buildInventoryTimelineChart(actualPoints, forecastPoints, conflicts, actualMode) {
  const W = 960, H = 330, P = 54, TOP = 42, BOTTOM = 220;
  const points = actualMode ? actualPoints.concat(forecastPoints) : forecastPoints;
  const series = [
    { key: 'coachClosingBoxes', label: '教练库存', axis: 'y', color: '#f2bc68' },
    { key: 'stockoutBoxes', label: '缺货盒数', axis: 'y', color: '#ff786f' },
    { key: 'inventoryAssetValue', label: '库存资产余额', axis: 'y1', color: '#72b7ff' },
  ];
  const scales = {
    actual: { y: { min: 0, max: 1 }, y1: { min: 0, max: 1 } },
    forecast: { y: { min: 0, max: 1 }, y1: { min: 0, max: 1 } },
  };
  for (const item of series) for (const point of points) {
    const value = point[item.key];
    if (!Number.isFinite(value)) continue;
    const scale = scales[point.kind][item.axis];
    scale.min = Math.min(scale.min, value);
    scale.max = Math.max(scale.max, value);
  }
  function x(index) { return P + index * (W - P * 2) / Math.max(1, points.length - 1); }
  function y(value, axis, kind) {
    const scale = scales[kind][axis];
    return BOTTOM - (value - scale.min) * (BOTTOM - TOP) / (scale.max - scale.min || 1);
  }
  const actualCount = actualMode ? actualPoints.length : 0;
  let html = '<div>';
  if (actualMode) {
    html += '<span style="color:#edf5f1;margin-right:12px">━ 实际历史</span><span style="color:#edf5f1;margin-right:12px">┅ 模拟预测</span>';
  } else {
    html += '<span style="color:#edf5f1;margin-right:12px">┅ 全部为假设／模拟</span>';
  }
  html += '<span style="color:#f2bc68;margin-right:12px">盒数轴：教练库存／缺货盒数</span><span style="color:#72b7ff">库存资产金额轴：库存资产余额</span></div>';
  html += '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">';
  if (actualCount > 0 && forecastPoints.length > 0) {
    const boundaryX = (x(actualCount - 1) + x(actualCount)) / 2;
    html += '<rect data-inventory-forecast-shade x="' + boundaryX + '" y="30" width="' + (W - P - boundaryX) + '" height="200" fill="#72b7ff" opacity="0.07"/>';
    html += '<line data-inventory-boundary x1="' + boundaryX + '" y1="30" x2="' + boundaryX + '" y2="230" stroke="#93a69f" stroke-width="1.5" stroke-dasharray="6 4"/>';
    html += '<text x="' + (boundaryX + 5) + '" y="30" fill="#93a69f" font-size="11">模拟预测起点</text>';
  }
  html += '<line x1="' + P + '" y1="' + y(0, 'y', 'forecast') + '" x2="' + (W - P) + '" y2="' + y(0, 'y', 'forecast') + '" stroke="#2a3935"/>';
  for (const kind of ['actual', 'forecast']) {
    for (const item of series) {
      let segment = [];
      function flushSegment() {
        const singleActualPoint = kind === 'actual' && actualCount === 1 && segment.length === 1;
        if (segment.length < 2 && !singleActualPoint) {
          segment = [];
          return;
        }
        const coordinates = segment.map(function (entry) { return x(entry.index) + ',' + y(entry.point[item.key], item.axis, kind); }).join(' ');
        html += '<polyline data-inventory-line="' + kind + '" data-series-path="' + item.key + '" data-axis="' + item.axis + '" points="' + coordinates + '" fill="none" stroke="' + item.color + '" stroke-width="2.5"' + (kind === 'forecast' ? ' stroke-dasharray="7 5"' : '') + '/>';
        segment = [];
      }
      for (let index = 0; index <= points.length; index++) {
        const point = points[index];
        if (point && point.kind === kind && Number.isFinite(point[item.key])) segment.push({ point: point, index: index });
        else flushSegment();
      }
    }
  }
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const isActual = point.kind === 'actual';
    html += '<g data-inventory-point="' + point.kind + '"' + (isActual ? ' data-snapshot-id="' + escapeHtml(point.snapshotId) + '" data-period-end="' + escapeHtml(point.periodEnd) + '"' : ' data-month="' + point.month + '"') + '>';
    for (const item of series) {
      const value = point[item.key];
      if (Number.isFinite(value)) {
        html += '<circle data-series="' + item.key + '" data-value="' + value + '" data-axis="' + item.axis + '" cx="' + x(index) + '" cy="' + y(value, item.axis, point.kind) + '" r="4" fill="#0b1110" stroke="' + item.color + '" stroke-width="2"><title>' + escapeHtml(item.label + '：' + number(value) + (isActual ? '；' + point.snapshotId : '')) + '</title></circle>';
      } else {
        html += '<text data-series="' + item.key + '" x="' + x(index) + '" y="' + (y(0, item.axis, point.kind) - 8) + '" text-anchor="middle" fill="#93a69f" font-size="10">未知</text>';
      }
    }
    html += '</g>';
  }
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const label = point.kind === 'actual' ? point.periodEnd.slice(0, 10) : point.label;
    html += '<text x="' + x(index) + '" y="248" transform="rotate(-35 ' + x(index) + ' 248)" fill="#93a69f" font-size="9" text-anchor="end">' + escapeHtml(label) + '</text>';
  }
  html += '<text x="' + P + '" y="18" fill="#93a69f" font-size="11">盒数轴 ' + (actualMode ? '实际 ' + number(scales.actual.y.max) + ' ／ ' : '') + '模拟 ' + number(scales.forecast.y.max) + '</text>';
  html += '<text x="' + P + '" y="238" fill="#93a69f" font-size="11">' + (actualMode ? '实际 ' + number(scales.actual.y.min) + ' ／ ' : '') + '模拟 ' + number(scales.forecast.y.min) + '</text>';
  html += '<text x="' + (W - P) + '" y="18" fill="#93a69f" font-size="11" text-anchor="end">库存资产金额轴 ' + (actualMode ? '实际 ' + number(scales.actual.y1.max) + ' ／ ' : '') + '模拟 ' + number(scales.forecast.y1.max) + '</text>';
  html += '<text x="' + (W - P) + '" y="238" fill="#93a69f" font-size="11" text-anchor="end">' + (actualMode ? '实际 ' + number(scales.actual.y1.min) + ' ／ ' : '') + '模拟 ' + number(scales.forecast.y1.min) + '</text></svg>';
  if (actualMode) {
    html += '<p data-inventory-summary>实际快照 ' + actualPoints.length + ' 期；后续为模拟预测，不属于实际经营结果。</p>';
    const degraded = actualPoints.some(function (point) { return series.some(function (item) { return !Number.isFinite(point[item.key]); }); });
    if (degraded) html += '<p class="warn">部分实际指标未知，未知值以断点显示，不参与数值比例计算。</p>';
    if (conflicts.length > 0) html += '<p class="warn" data-inventory-conflict>同期快照冲突：' + escapeHtml(conflicts.join('、')) + '；冲突期间未绘制。</p>';
  } else {
    html += '<p data-inventory-summary>全部为假设／模拟；模拟预测不属于实际经营结果。</p>';
  }
  return html;
}
function renderKpis(result, baseline, inventoryKpis) {
  const m = result.metrics, b = baseline.metrics;
  const cards = [
    ['现金安全', month(m.cashBreakMonth), '安全月数 ' + m.cashSafetyMonths + '；最低 ' + money(m.minCashBalance), delta(m.endingCash, b.endingCash, ' 元')],
    ['月度经营保本', month(m.operatingBreakEvenMonth), '持续经营：' + month(m.sustainableBreakEvenMonth), monthDelta(m.operatingBreakEvenMonth, b.operatingBreakEvenMonth)],
    ['累计现金回正', month(m.cashPaybackMonth), '不含期初现金，覆盖押金与开办费', monthDelta(m.cashPaybackMonth, b.cashPaybackMonth)],
    ['期末现金', money(m.endingCash), '第 ' + result.months.length + ' 月', delta(m.endingCash, b.endingCash, ' 元')],
    ['教练健康', number(m.activeCoaches) + ' 活跃', '当月休眠 ' + number(m.dormantCoaches) + '；休眠率 ' + number(m.dormancyRate * 100) + '%', delta(m.activeCoaches, b.activeCoaches, ' 人')],
    ['库存与组织预警', number(m.shortageBoxes) + ' 盒缺货', '滞留 ' + number(m.dormantInventory) + ' 盒；扩编缺口 ' + m.staffExpansionGap, delta(m.shortageBoxes, b.shortageBoxes, ' 盒')],
  ];
  let html = '';
  for (const card of cards) html += '<article class="kpi"><span>' + card[0] + '</span><strong>' + card[1] + '</strong><small>' + card[2] + '</small><div class="delta">' + card[3] + '</div></article>';
  html += '<article class="kpi" id="inventory-asset-kpi"><span>库存与资产</span><strong>' + moneyOrUnknown(inventoryKpis.inventoryAssetValue) + '</strong><small>缺货机会成本 ' + moneyOrUnknown(inventoryKpis.stockoutOpportunityCost) + '</small><div class="delta">现金流净影响 ' + moneyOrUnknown(inventoryKpis.inventoryCashFlow.netCashImpact) + '</div></article>';
  document.getElementById('kpis').innerHTML = html;
}
function renderTables(result, input) {
  const months = result.months;
  document.getElementById('users-table').innerHTML = table(
    ['月份', '新首购', '实际首购', '延伸', '维持', '完赛', '流失', '托管迁入'],
    months.map((m) => [m.month, number(userTotal(m, 'newFirstPurchaseUsers')), number(userTotal(m, 'actualFirstPurchaseUsers')), number(userTotal(m, 'extensionUsers')), number(userTotal(m, 'maintenanceUsers')), number(m.completedUsers), number(userTotal(m, 'churnedUsers')), number(m.custodiedUsers)]),
  );
  document.getElementById('ltv').innerHTML = '<p>教练渠道 12 月 LTV：' + money(result.ltv.coach.netLTV['12']) + '；直营／托管 12 月 LTV：' + money(result.ltv.direct.netLTV['12']) + '</p>';
  document.getElementById('coaches-table').innerHTML = table(
    ['月份', '新增候选', '新增扶持记录', '正式准入', '活跃', '休眠', '教练实际收益', '奖励负债'],
    months.map((m) => [m.month, number(m.newCandidates), number(m.newSupportRecords), number(m.admittedCoaches), number(m.activeCoaches), number(m.dormantCoaches), money(m.coachEarnings), money(m.rewardLiability)]),
  );
  document.getElementById('finance-table').innerHTML = table(
    ['月份', '拿货盒数', '首箱盒数', '库存', '缺货', '终端 GMV', '确认收入', '经营净额', '持续经营净额', '等效维持用户 BEP'],
    months.map((m, index) => [m.month, number(m.coachOrderBoxes), number(m.firstCaseBoxes), number(m.coachInventory), number(m.shortageBoxes), money(m.terminalGMV), money(m.confirmedRevenue), money(m.operatingNet), money(sustainableOperatingNet(m, input)), result.equivalentMaintenanceBEP[index] === null ? '未达到' : number(result.equivalentMaintenanceBEP[index]) + ' 人']),
  );
  document.getElementById('staff-table').innerHTML = table(
    ['月份', '员工', '教练容量', '用户容量', '利用率', '建议员工', '扩编缺口', '底薪', '孵化奖', '绩效'],
    months.map((m) => [m.month, m.staffCount, number(m.coachCapacity), number(m.userCapacity), number(toDisplayPercent(m.capacityUtilization)) + '%', m.suggestedStaffCount, m.staffExpansionGap, money(m.staffBaseSalary), money(m.incubationReward), money(m.staffPerformance)]),
  );
  document.getElementById('audit-table').innerHTML = table(
    ['月份', '现金流入', '现金流出', '期末现金', '奖励抵扣', '奖励付现', '产品成本', '动态平摊'],
    months.map((m) => [m.month, money(m.cashInflow), money(m.cashOutflow), money(m.cashBalance), money(m.rewardOffsetUsed), money(m.rewardCash), money(m.productCost), money(m.overhead)]),
  );
}
function render() {
  const input = currentInput();
  dashboard = buildDashboard(currentInput());
  const result = dashboard.scenarios[state.scenario];
  const months = result.months;
  const last = months[months.length - 1];
  inventoryKpis = computeInventoryKpis(resolveInventoryKpiParams(
    state.dataMode,
    activeSnapshotInput,
    state.platformStockBoxes,
    last,
    input.product
  ));
  renderKpis(result, dashboard.scenarios.baseline, inventoryKpis);
  document.getElementById('cash-chart').innerHTML = buildChart(months, [{ color: '#9ddd70', value: (m) => m.cashBalance, markMinimum: true }]);
  document.getElementById('operating-chart').innerHTML = buildChart(months, [
    { color: '#9ddd70', value: (m) => m.operatingNet },
    { color: '#72b7ff', value: (m) => sustainableOperatingNet(m, input) },
  ]);
  document.getElementById('coach-chart').innerHTML = buildChart(months, [
    { color: '#9ddd70', value: (m) => m.activeCoaches },
    { color: '#ff786f', value: (m) => m.dormantCoaches },
  ]);
  const inventoryChart = document.getElementById('inventory-chart');
  const actualMode = state.dataMode === 'actual';
  const actualTimeline = actualMode ? buildActualInventoryPoints(snapshotHistory) : { points: [], conflicts: [] };
  const forecastPoints = buildForecastInventoryPoints(months, input.product, state.assumptionPlatformStockBoxes);
  inventoryChart.innerHTML = buildInventoryTimelineChart(actualTimeline.points, forecastPoints, actualTimeline.conflicts, actualMode);
  document.getElementById('capacity-chart').innerHTML = buildChart(months, [{ color: '#72b7ff', value: (m) => toDisplayPercent(m.capacityUtilization) }]);
  ceoCharts = buildCeoCharts(months, input, state.cashWarningLine);
  renderCeoCharts(ceoCharts);
  renderTables(result, input);
  document.getElementById('input-snapshot').textContent = JSON.stringify({
    mode: state.dataMode,
    scenarioInput: input,
    importedSnapshot: activeSnapshot,
  }, null, 2);
}
let debounceTimer = null;
function scheduleRender() { clearTimeout(debounceTimer); debounceTimer = setTimeout(render, 50); }
${SLIDERS.map((s) => `
state['${s.key}'] = Number(document.getElementById('sl-${s.key}').value);
document.getElementById('val-${s.key}').textContent = ${s.expr.replace(/this\.value/g, "document.getElementById('sl-" + s.key + "').value")};
document.getElementById('sl-${s.key}').addEventListener('input', function () {
  const path = ${JSON.stringify(s.key === 'retention' ? 'users.monthlyRetention' : s.key === 'candidate' ? 'coaches.candidateRate' : 'coaches.monthlyNewUsersPerCoach')};
  if (commitNumericPath(path, this.value, 'slider')) {
    state['${s.key}'] = Number(this.value);
    document.getElementById('val-${s.key}').textContent = ${s.expr};
  }
});`).join('\n')}
${INPUT_CONTROLS.map((control) => {
    const id = controlId(control.path);
    if (FLOW_PATHS.includes(control.path)) {
      return `document.getElementById('${id}').addEventListener('input', function () { updateFlowDraft('${control.path}', this.value); });`;
    }
    if (LEGACY_CONTROL_PATHS.has(control.path)) {
      return `document.getElementById('${id}').addEventListener('input', function () {
  const value = parseControlValue(this.value, ${control.min}, ${control.kind === 'integer'});
  if (value === null) { setControlError(this, '输入格式或范围无效。'); return; }
  commitNumericPath('${control.path}', this.value, 'number');
});`;
    }
    return `document.getElementById('${id}').addEventListener('input', function () { commitNumericPath('${control.path}', this.value, 'number'); });`;
  }).join('\n')}
document.getElementById('apply-flow-rates').addEventListener('click', applyFlowRates);
document.getElementById('ci-staff-autoExpand').addEventListener('change', function () {
  state.values.staff.autoExpand = this.checked;
  scheduleRender();
});
document.querySelectorAll('[data-scenario]').forEach(function (button) {
  button.addEventListener('click', function () {
    state.scenario = button.getAttribute('data-scenario');
    document.querySelectorAll('[data-scenario]').forEach(function (item) { item.classList.remove('active'); });
    button.classList.add('active');
    scheduleRender();
  });
});
render();
</script></body></html>`;
}
