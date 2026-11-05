import { describe, expect, it } from 'vitest';
import { computeInventoryAssetValue } from '../src/finance';
import { generateReport } from '../src/html-generator';
import type { SandboxInput } from '../src/schema';
import { sampleInput } from './fixtures';

type FieldKind = 'integer' | 'money' | 'percent' | 'multiplier' | 'boolean' | 'inventory';
type FieldSpec = {
  path: string;
  kind: FieldKind;
  valid: string;
  expected: number;
  invalid?: string[];
};

const FLOW_PATHS = [
  'users.extensionRate',
  'users.maintenanceRate',
  'users.churnRate',
] as const;

const FIELD_SPECS: FieldSpec[] = [
  { path: 'horizonMonths', kind: 'integer', valid: '12', expected: 12, invalid: ['0', '1.5'] },
  { path: 'product.boxPrice', kind: 'money', valid: '666.66', expected: 666.66, invalid: ['0', '1.234'] },
  { path: 'product.bagsPerBox', kind: 'integer', valid: '20', expected: 20, invalid: ['0', '1.5'] },
  { path: 'product.bagsPerMonth', kind: 'integer', valid: '40', expected: 40, invalid: ['0', '1.5'] },
  { path: 'product.firstPurchaseBoxes', kind: 'integer', valid: '2', expected: 2, invalid: ['0', '1.5'] },
  { path: 'product.boxesPerCase', kind: 'integer', valid: '12', expected: 12, invalid: ['0', '1.5'] },
  { path: 'product.coachPurchasePrice', kind: 'money', valid: '456.78', expected: 456.78, invalid: ['0', '1.234'] },
  { path: 'product.unitCost', kind: 'money', valid: '123.45', expected: 123.45, invalid: ['0', '1.234'] },
  { path: 'seed.phase1.users', kind: 'integer', valid: '21', expected: 21, invalid: ['-1', '1.5'] },
  { path: 'seed.phase1.weekCompletionRate', kind: 'percent', valid: '82.5', expected: 0.825, invalid: ['-0.01', '100.01'] },
  { path: 'seed.phase1.finalPurchaseRate', kind: 'percent', valid: '72.5', expected: 0.725, invalid: ['-0.01', '100.01'] },
  { path: 'seed.phase2.users', kind: 'integer', valid: '81', expected: 81, invalid: ['-1', '1.5'] },
  { path: 'seed.phase2.checkInCompletionRate', kind: 'percent', valid: '81.5', expected: 0.815, invalid: ['-0.01', '100.01'] },
  { path: 'seed.phase2.finalPurchaseRate', kind: 'percent', valid: '73.5', expected: 0.735, invalid: ['-0.01', '100.01'] },
  { path: 'users.directNewUsersPerMonth', kind: 'integer', valid: '11', expected: 11, invalid: ['-1', '1.5'] },
  { path: 'users.completionRate', kind: 'percent', valid: '78.5', expected: 0.785, invalid: ['-0.01', '100.01'] },
  { path: 'users.extensionRate', kind: 'percent', valid: '30', expected: 0.3, invalid: ['-0.01', '100.01'] },
  { path: 'users.maintenanceRate', kind: 'percent', valid: '50', expected: 0.5, invalid: ['-0.01', '100.01'] },
  { path: 'users.churnRate', kind: 'percent', valid: '20', expected: 0.2, invalid: ['-0.01', '100.01'] },
  { path: 'users.monthlyRetention', kind: 'percent', valid: '88.5', expected: 0.885, invalid: ['-0.01', '100.01'] },
  { path: 'coaches.initialCandidates', kind: 'integer', valid: '2', expected: 2, invalid: ['-1', '1.5'] },
  { path: 'coaches.initialSupportRecords', kind: 'integer', valid: '3', expected: 3, invalid: ['-1', '1.5'] },
  { path: 'coaches.validRecordRate', kind: 'percent', valid: '91.5', expected: 0.915, invalid: ['-0.01', '100.01'] },
  { path: 'coaches.candidateRate', kind: 'percent', valid: '31.5', expected: 0.315, invalid: ['-0.01', '100.01'] },
  { path: 'coaches.supportCompletionRate', kind: 'percent', valid: '79.5', expected: 0.795, invalid: ['-0.01', '100.01'] },
  { path: 'coaches.requiredRecordedDays', kind: 'integer', valid: '21', expected: 21, invalid: ['-1', '22', '1.5'] },
  { path: 'coaches.supportUsersRequired', kind: 'integer', valid: '9', expected: 9, invalid: ['0', '1.5'] },
  { path: 'coaches.activeNewPaidUsers', kind: 'integer', valid: '5', expected: 5, invalid: ['0', '1.5'] },
  { path: 'coaches.monthlyNewUsersPerCoach', kind: 'integer', valid: '7', expected: 7, invalid: ['-1', '1.5'] },
  { path: 'coaches.dataRewardRate', kind: 'percent', valid: '11.5', expected: 0.115, invalid: ['-0.01', '100.01'] },
  { path: 'coaches.referralRewardRate', kind: 'percent', valid: '12.5', expected: 0.125, invalid: ['-0.01', '100.01'] },
  { path: 'coaches.dataRewardEligibleRate', kind: 'percent', valid: '92.5', expected: 0.925, invalid: ['-0.01', '100.01'] },
  { path: 'coaches.referralRewardEligibleRate', kind: 'percent', valid: '93.5', expected: 0.935, invalid: ['-0.01', '100.01'] },
  { path: 'coaches.rewardOffsetRate', kind: 'percent', valid: '45.5', expected: 0.455, invalid: ['-0.01', '100.01'] },
  { path: 'coaches.restockPoint', kind: 'integer', valid: '10', expected: 10, invalid: ['-1', '1.5'] },
  { path: 'staff.initialCount', kind: 'integer', valid: '4', expected: 4, invalid: ['0', '1.5'] },
  { path: 'staff.monthlySalary', kind: 'money', valid: '6500.50', expected: 6500.5, invalid: ['-0.01', '1.234'] },
  { path: 'staff.coachesPerStaff', kind: 'integer', valid: '6', expected: 6, invalid: ['0', '1.5'] },
  { path: 'staff.usersPerStaff', kind: 'integer', valid: '120', expected: 120, invalid: ['0', '1.5'] },
  { path: 'finance.initialCash', kind: 'money', valid: '400000.25', expected: 400000.25, invalid: ['-0.01', '1.234'] },
  { path: 'finance.rent', kind: 'money', valid: '14000.25', expected: 14000.25, invalid: ['-0.01', '1.234'] },
  { path: 'finance.monthlyOffice', kind: 'money', valid: '7000.25', expected: 7000.25, invalid: ['-0.01', '1.234'] },
  { path: 'finance.otherFixedCosts', kind: 'money', valid: '100.25', expected: 100.25, invalid: ['-0.01', '1.234'] },
  { path: 'finance.deposit', kind: 'money', valid: '25000.25', expected: 25000.25, invalid: ['-0.01', '1.234'] },
  { path: 'finance.setupFee', kind: 'money', valid: '15000.25', expected: 15000.25, invalid: ['-0.01', '1.234'] },
  { path: 'finance.overheadRate', kind: 'percent', valid: '12.5', expected: 0.125, invalid: ['-0.01', '100.01'] },
  { path: 'finance.staffPerformanceRate', kind: 'percent', valid: '13.5', expected: 0.135, invalid: ['-0.01', '100.01'] },
  { path: 'finance.incubationReward', kind: 'money', valid: '450.25', expected: 450.25, invalid: ['-0.01', '1.234'] },
  { path: 'scenarios.stress.multipliers.completion', kind: 'multiplier', valid: '0.75', expected: 0.75, invalid: ['-0.01'] },
  { path: 'scenarios.stress.multipliers.retention', kind: 'multiplier', valid: '0.85', expected: 0.85, invalid: ['-0.01'] },
  { path: 'scenarios.stress.multipliers.acquisition', kind: 'multiplier', valid: '0.65', expected: 0.65, invalid: ['-0.01'] },
  { path: 'scenarios.stress.multipliers.qualification', kind: 'multiplier', valid: '0.55', expected: 0.55, invalid: ['-0.01'] },
  { path: 'scenarios.upside.multipliers.completion', kind: 'multiplier', valid: '1.25', expected: 1.25, invalid: ['-0.01'] },
  { path: 'scenarios.upside.multipliers.retention', kind: 'multiplier', valid: '1.35', expected: 1.35, invalid: ['-0.01'] },
  { path: 'scenarios.upside.multipliers.acquisition', kind: 'multiplier', valid: '1.45', expected: 1.45, invalid: ['-0.01'] },
  { path: 'scenarios.upside.multipliers.qualification', kind: 'multiplier', valid: '1.55', expected: 1.55, invalid: ['-0.01'] },
  { path: 'platformStockBoxes', kind: 'inventory', valid: '345', expected: 345, invalid: ['-1', '1.5'] },
];

function getPath(value: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

class FakeElement {
  innerHTML = '';
  textContent = '';
  value = '';
  checked = false;
  className = '';
  files: null = null;
  readOnly = false;
  disabled = false;
  private attributes = new Map<string, string>();
  private listeners = new Map<string, Array<(this: FakeElement) => void>>();
  private classes = new Set<string>();

  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    toggle: (name: string, force?: boolean) => {
      if (force === true) this.classes.add(name);
      else if (force === false) this.classes.delete(name);
      else if (this.classes.has(name)) this.classes.delete(name);
      else this.classes.add(name);
      return this.classes.has(name);
    },
  };

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === 'readonly') this.readOnly = true;
    if (name === 'disabled') this.disabled = true;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === 'readonly') this.readOnly = false;
    if (name === 'disabled') this.disabled = false;
  }

  addEventListener(type: string, listener: (this: FakeElement) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener.call(this);
  }
}

function createBrowserReport(initialInput: SandboxInput = sampleInput()) {
  const html = generateReport(initialInput);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  expect(script).toBeTypeOf('string');
  const browserScript = script?.replace(/__vite_ssr_import_\d+__\./g, '') ?? '';
  const elements = new Map<string, FakeElement>();
  const controls = new Map<string, FakeElement>();
  const getElement = (id: string) => {
    const existing = elements.get(id);
    if (existing) return existing;
    const created = new FakeElement();
    elements.set(id, created);
    return created;
  };

  for (const match of html.matchAll(/<input\b[^>]*>/g)) {
    const tag = match[0];
    const id = tag.match(/\bid="([^"]+)"/)?.[1];
    if (!id) continue;
    const element = getElement(id);
    for (const attribute of tag.matchAll(/([\w-]+)="([^"]*)"/g)) {
      element.setAttribute(attribute[1], attribute[2]);
    }
    element.value = element.getAttribute('value') ?? '';
    element.checked = element.hasAttribute('checked');
    element.readOnly = element.hasAttribute('readonly');
    element.disabled = element.hasAttribute('disabled');
    const path = element.getAttribute('data-input-path');
    if (path) controls.set(path, element);
  }

  const scenarioButtons = ['baseline', 'stress', 'upside'].map((scenario) => {
    const button = new FakeElement();
    button.setAttribute('data-scenario', scenario);
    return button;
  });
  const modeButtons = ['assumption', 'actual'].map((mode) => {
    const button = new FakeElement();
    button.setAttribute('data-data-mode', mode);
    return button;
  });
  const document = {
    getElementById: getElement,
    querySelectorAll(selector: string) {
      if (selector === '[data-scenario]') return scenarioButtons;
      if (selector === '[data-data-mode]') return modeButtons;
      if (selector === '[data-input-path]') return [...controls.values()];
      return [];
    },
  };
  const network = { fetch: 0, xhr: 0 };
  const fetch = () => {
    network.fetch += 1;
    throw new Error('输入过程禁止网络请求');
  };
  class XMLHttpRequest {
    constructor() {
      network.xhr += 1;
      throw new Error('输入过程禁止网络请求');
    }
  }
  const runImmediately = (callback: () => void) => {
    callback();
    return 1;
  };
  const api = new Function(
    'document',
    'setTimeout',
    'clearTimeout',
    'fetch',
    'XMLHttpRequest',
    `${browserScript}; return {
      state,
      currentInput,
      setDataMode,
      importSnapshotFromText,
      getDashboard: function () { return dashboard; },
      getActiveSnapshot: function () { return activeSnapshot; }
    };`,
  )(document, runImmediately, () => undefined, fetch, XMLHttpRequest) as {
    state: { dataMode: string; scenario: string; platformStockBoxes: number; [key: string]: any };
    currentInput(): SandboxInput;
    setDataMode(mode: 'actual' | 'assumption'): void;
    importSnapshotFromText(raw: string): void;
    getDashboard(): any;
    getActiveSnapshot(): any;
  };

  const control = (path: string) => {
    const element = controls.get(path);
    if (!element) throw new Error(`缺少控件 data-input-path="${path}"`);
    return element;
  };
  const setInput = (path: string, raw: string) => {
    const element = control(path);
    element.value = raw;
    element.dispatch('input');
  };
  const committed = (path: string) => {
    return path === 'platformStockBoxes' ? api.state.platformStockBoxes : getPath(api.currentInput(), path);
  };

  return {
    api,
    html,
    controls,
    control,
    setInput,
    committed,
    element: getElement,
    network,
    importSnapshot(snapshot: any) {
      api.importSnapshotFromText(JSON.stringify(snapshot));
    },
    clickApplyFlow() {
      getElement('apply-flow-rates').dispatch('click');
    },
    chart: () => getElement('inventory-chart').innerHTML,
  };
}

function goldenSnapshot(): any {
  return {
    schemaVersion: '1.0',
    snapshotId: 'snapshot-2026-10-r1',
    source: {
      kind: 'manual-validated',
      sourceSystem: 'offline-operating-ledger',
      dataMode: 'actual',
      generatorVersion: '1.0.0',
    },
    generatedAt: '2026-11-01T02:00:00.000Z',
    asOf: '2026-10-31T16:00:00.000Z',
    periodStart: '2026-09-30T16:00:00.000Z',
    periodEnd: '2026-10-31T16:00:00.000Z',
    timezone: 'Asia/Shanghai',
    sourceRevision: 'ledger-revision-1',
    inventory: {
      openingPlatformBoxes: 100,
      inboundBoxes: 200,
      otherOutboundBoxes: 20,
      authorizedAdjustmentBoxes: -10,
      closingPlatformBoxes: 120,
      physicalCountBoxes: 120,
      coachOpeningBoxes: 30,
      coachSoldOrConsumedBoxes: 140,
      coachAdjustmentBoxes: 0,
      coachClosingBoxes: 40,
    },
    coachOrders: {
      orderedBoxes: 160,
      allocatedBoxes: 150,
      pickedUpBoxes: 150,
      stockoutBoxes: 10,
      sourceRefs: [{
        sourceEventId: 'pickup-2026-10',
        revision: 1,
        occurredAt: '2026-10-15T04:00:00.000Z',
      }],
    },
    productPricing: {
      currency: 'CNY',
      unitCostMinor: 16000,
      coachPickupPriceMinor: 22000,
      revenuePerBoxMinor: 66000,
      stockoutPriceBasis: 'terminal-sales',
      effectiveFrom: '2026-09-30T16:00:00.000Z',
      effectiveTo: '2026-10-31T16:00:00.000Z',
      priceRevision: 'price-revision-1',
    },
    cashMovements: {
      coachReceipts: [{
        sourceEventId: 'receipt-2026-10',
        revision: 1,
        occurredAt: '2026-10-20T06:00:00.000Z',
        amount: { amountMinor: 3300000, currency: 'CNY' },
        orderRef: 'order-opaque-1',
        kind: 'receipt',
      }],
      procurementPayments: [{
        sourceEventId: 'payment-2026-10',
        revision: 1,
        occurredAt: '2026-10-10T06:00:00.000Z',
        amount: { amountMinor: 3200000, currency: 'CNY' },
        purchaseRef: 'purchase-opaque-1',
        kind: 'payment',
      }],
    },
    dataQuality: {
      status: 'complete',
      issues: [],
      missingFields: [],
      duplicateSourceEventIds: [],
    },
  };
}

function forecastInventoryValues(chart: string): number[] {
  return [...chart.matchAll(/<g data-inventory-point="forecast"[^>]*>([\s\S]*?)<\/g>/g)].map((point) => {
    const value = point[1].match(/data-series="inventoryAssetValue" data-value="([^"]+)"/)?.[1];
    if (value === undefined) throw new Error('预测点缺少库存资产值');
    return Number(value);
  });
}

describe('子任务 8：全局经营假设输入与校验', () => {
  it('完整覆盖每个数值字段的控件—state—currentInput 映射', () => {
    const report = createBrowserReport();
    const failures: string[] = [];
    for (const spec of FIELD_SPECS) {
      if (FLOW_PATHS.includes(spec.path as typeof FLOW_PATHS[number])) continue;
      if (!report.controls.has(spec.path)) {
        failures.push(`${spec.path}: 缺少控件`);
        continue;
      }
      try {
        report.setInput(spec.path, spec.valid);
        const actual = report.committed(spec.path);
        if (actual !== spec.expected) failures.push(`${spec.path}: 期望 ${spec.expected}，实际 ${actual}`);
        if (report.control(spec.path).getAttribute('aria-invalid') === 'true') {
          failures.push(`${spec.path}: 合法输入被标记为非法`);
        }
      } catch (error) {
        failures.push(`${spec.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    expect(failures).toEqual([]);
    expect(report.controls.has('staff.autoExpand')).toBe(true);
    expect(report.control('staff.autoExpand').getAttribute('type')).toBe('checkbox');
  });

  it('所有计数字段严格执行整数、最小值和记录天数上限', () => {
    const report = createBrowserReport();
    for (const spec of FIELD_SPECS.filter((field) => field.kind === 'integer' || field.kind === 'inventory')) {
      report.setInput(spec.path, spec.valid);
      for (const raw of spec.invalid ?? []) {
        const before = report.committed(spec.path);
        const dashboard = report.api.getDashboard();
        report.setInput(spec.path, raw);
        expect(report.committed(spec.path), `${spec.path} 接受非法值 ${raw}`).toBe(before);
        expect(report.api.getDashboard(), `${spec.path} 非法值 ${raw} 触发重算`).toBe(dashboard);
        expect(report.control(spec.path).getAttribute('aria-invalid')).toBe('true');
      }
      report.setInput(spec.path, spec.valid);
      expect(report.committed(spec.path)).toBe(spec.expected);
    }
  });

  it('统一拒绝空值、非有限数、超安全整数、科学计数法和非十进制格式', () => {
    const report = createBrowserReport();
    const path = 'platformStockBoxes';
    const before = report.committed(path);
    const dashboard = report.api.getDashboard();
    for (const raw of ['', '   ', 'NaN', 'Infinity', '-Infinity', '9007199254740992', '1e2', '0x10', '0b10', '1,000']) {
      report.setInput(path, raw);
      expect(report.committed(path), `接受非法格式 ${JSON.stringify(raw)}`).toBe(before);
      expect(report.api.getDashboard()).toBe(dashboard);
      expect(report.control(path).value).toBe(raw);
      expect(report.control(path).getAttribute('aria-invalid')).toBe('true');
    }
  });

  it('金额允许最多两位小数且不静默取整或四舍五入', () => {
    const report = createBrowserReport();
    const moneyFields = FIELD_SPECS.filter((field) => field.kind === 'money');
    for (const spec of moneyFields) {
      report.setInput(spec.path, spec.valid);
      expect(report.committed(spec.path)).toBe(spec.expected);
      for (const raw of spec.invalid ?? []) {
        const before = report.committed(spec.path);
        const dashboard = report.api.getDashboard();
        report.setInput(spec.path, raw);
        expect(report.committed(spec.path), `${spec.path} 接受 ${raw}`).toBe(before);
        expect(report.api.getDashboard()).toBe(dashboard);
      }
      report.setInput(spec.path, spec.valid);
    }
  });

  it('百分比按 0—100 输入并转换回 0—1，边界外输入被阻断', () => {
    const report = createBrowserReport();
    for (const spec of FIELD_SPECS.filter((field) => field.kind === 'percent')) {
      if (FLOW_PATHS.includes(spec.path as typeof FLOW_PATHS[number])) continue;
      report.setInput(spec.path, spec.valid);
      expect(report.committed(spec.path)).toBe(spec.expected);
      for (const raw of spec.invalid ?? []) {
        const before = report.committed(spec.path);
        report.setInput(spec.path, raw);
        expect(report.committed(spec.path), `${spec.path} 接受 ${raw}`).toBe(before);
      }
    }
    report.setInput('coaches.candidateRate', '0');
    expect(report.committed('coaches.candidateRate')).toBe(0);
    report.setInput('coaches.candidateRate', '100');
    expect(report.committed('coaches.candidateRate')).toBe(1);
  });

  it('场景系数允许零和大于 1 的有限小数，不按百分比换算', () => {
    const report = createBrowserReport();
    for (const spec of FIELD_SPECS.filter((field) => field.kind === 'multiplier')) {
      report.setInput(spec.path, spec.valid);
      expect(report.committed(spec.path)).toBe(spec.expected);
      report.setInput(spec.path, '0');
      expect(report.committed(spec.path)).toBe(0);
      const dashboard = report.api.getDashboard();
      for (const raw of [...(spec.invalid ?? []), '1e2', 'Infinity']) {
        report.setInput(spec.path, raw);
        expect(report.committed(spec.path)).toBe(0);
        expect(report.api.getDashboard()).toBe(dashboard);
      }
    }
  });

  it('非法输入保留原文、上一份有效报告和 state，并提供可访问错误后恢复', () => {
    const report = createBrowserReport();
    const path = 'product.unitCost';
    const before = report.committed(path);
    const dashboard = report.api.getDashboard();
    report.setInput(path, '1.234');

    expect(report.committed(path)).toBe(before);
    expect(report.api.getDashboard()).toBe(dashboard);
    expect(report.control(path).value).toBe('1.234');
    expect(report.control(path).getAttribute('aria-invalid')).toBe('true');
    const errorId = report.control(path).getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(report.element(errorId ?? '').textContent).toContain('两位小数');
    expect(report.element('input-snapshot').textContent).not.toMatch(/NaN|Infinity/);

    report.setInput(path, '161.25');
    expect(report.committed(path)).toBe(161.25);
    expect(report.api.getDashboard()).not.toBe(dashboard);
    expect(report.control(path).getAttribute('aria-invalid')).not.toBe('true');
    expect(report.element(errorId ?? '').textContent).toBe('');
  });

  it('三项分流率使用草稿和显式提交，合法与非法组合都保持原子性', () => {
    const report = createBrowserReport();
    const initialDashboard = report.api.getDashboard();
    report.setInput('users.extensionRate', '30');
    expect(report.committed('users.extensionRate')).toBe(0.2);
    expect(report.api.getDashboard()).toBe(initialDashboard);

    report.setInput('users.maintenanceRate', '50');
    report.setInput('users.churnRate', '20');
    report.clickApplyFlow();
    expect(report.committed('users.extensionRate')).toBe(0.3);
    expect(report.committed('users.maintenanceRate')).toBe(0.5);
    expect(report.committed('users.churnRate')).toBe(0.2);
    const validDashboard = report.api.getDashboard();
    expect(validDashboard).not.toBe(initialDashboard);

    report.setInput('users.extensionRate', '70');
    report.setInput('users.maintenanceRate', '50');
    report.setInput('users.churnRate', '20');
    report.clickApplyFlow();
    expect(report.committed('users.extensionRate')).toBe(0.3);
    expect(report.committed('users.maintenanceRate')).toBe(0.5);
    expect(report.committed('users.churnRate')).toBe(0.2);
    expect(report.api.getDashboard()).toBe(validDashboard);
    for (const path of FLOW_PATHS) {
      expect(report.control(path).getAttribute('aria-invalid')).toBe('true');
      const errorId = report.control(path).getAttribute('aria-describedby');
      expect(report.element(errorId ?? '').textContent).toContain('100%');
    }
  });

  it('三组滑块与数字框双向同步，计数滑块也不能绕过整数校验', () => {
    const report = createBrowserReport();
    const cases = [
      { path: 'users.monthlyRetention', slider: 'sl-retention', output: 'val-retention', number: '42.5', slide: '55.5', expected: 0.555 },
      { path: 'coaches.candidateRate', slider: 'sl-candidate', output: 'val-candidate', number: '37.5', slide: '45.5', expected: 0.455 },
      { path: 'coaches.monthlyNewUsersPerCoach', slider: 'sl-acquisition', output: 'val-acquisition', number: '8', slide: '9', expected: 9 },
    ];
    for (const item of cases) {
      report.setInput(item.path, item.number);
      expect(report.element(item.slider).value).toBe(item.number);
      expect(report.element(item.output).textContent).toContain(item.number);

      const slider = report.element(item.slider);
      slider.value = item.slide;
      slider.dispatch('input');
      expect(report.control(item.path).value).toBe(item.slide);
      expect(report.element(item.output).textContent).toContain(item.slide);
      expect(report.committed(item.path)).toBe(item.expected);
    }

    const before = report.committed('coaches.monthlyNewUsersPerCoach');
    const dashboard = report.api.getDashboard();
    const acquisition = report.element('sl-acquisition');
    acquisition.value = '9.5';
    acquisition.dispatch('input');
    expect(report.committed('coaches.monthlyNewUsersPerCoach')).toBe(before);
    expect(report.api.getDashboard()).toBe(dashboard);
    expect(report.control('coaches.monthlyNewUsersPerCoach').getAttribute('aria-invalid')).toBe('true');
  });

  it('autoExpand 只通过布尔 checkbox 更新，不经过数字解析', () => {
    const report = createBrowserReport();
    const checkbox = report.control('staff.autoExpand');
    expect(checkbox.getAttribute('type')).toBe('checkbox');
    checkbox.checked = false;
    checkbox.dispatch('change');
    expect(report.api.currentInput().staff.autoExpand).toBe(false);
    checkbox.checked = true;
    checkbox.dispatch('change');
    expect(report.api.currentInput().staff.autoExpand).toBe(true);
  });

  it('实际模式锁定快照字段，手工事件也不能覆盖真实库存和价格', () => {
    const report = createBrowserReport();
    report.setInput('platformStockBoxes', '345');
    report.importSnapshot(goldenSnapshot());
    const dashboard = report.api.getDashboard();
    const protectedFields = new Map([
      ['platformStockBoxes', 270],
      ['product.unitCost', 160],
      ['product.coachPurchasePrice', 220],
      ['product.boxPrice', 660],
    ]);
    for (const [path, expected] of protectedFields) {
      const input = report.control(path);
      expect(input.readOnly || input.disabled, `${path} 在实际模式仍可编辑`).toBe(true);
      expect(report.committed(path)).toBe(expected);
      input.value = '999';
      input.dispatch('input');
      expect(report.committed(path)).toBe(expected);
      expect(report.api.getDashboard()).toBe(dashboard);
    }
    expect(report.api.state.platformStockBoxes).toBe(270);
  });

  it('实际快照可选价格缺失时保留显式模拟假设，不把未知值传入重算', () => {
    const report = createBrowserReport();
    report.setInput('product.unitCost', '123.45');
    report.setInput('product.coachPurchasePrice', '456.78');
    report.setInput('product.boxPrice', '666.66');
    const degraded = goldenSnapshot();
    delete degraded.productPricing.unitCostMinor;
    delete degraded.productPricing.coachPickupPriceMinor;
    delete degraded.productPricing.revenuePerBoxMinor;
    degraded.dataQuality.status = 'degraded';
    degraded.dataQuality.missingFields = [
      'productPricing.unitCostMinor',
      'productPricing.coachPickupPriceMinor',
      'productPricing.revenuePerBoxMinor',
    ];
    report.importSnapshot(degraded);

    expect(report.api.currentInput().product.unitCost).toBe(123.45);
    expect(report.api.currentInput().product.coachPurchasePrice).toBe(456.78);
    expect(report.api.currentInput().product.boxPrice).toBe(666.66);
    expect(report.control('product.unitCost').value).toBe('123.45');
    expect(report.control('product.coachPurchasePrice').value).toBe('456.78');
    expect(report.control('product.boxPrice').value).toBe('666.66');
    expect(report.chart()).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('恢复假设模式还原显式假设值，库存预测不隐藏回退固定盒数', () => {
    const report = createBrowserReport();
    report.setInput('platformStockBoxes', '345');
    report.setInput('product.unitCost', '123.45');
    report.importSnapshot(goldenSnapshot());
    report.api.setDataMode('assumption');

    expect(report.committed('platformStockBoxes')).toBe(345);
    expect(report.committed('product.unitCost')).toBe(123.45);
    expect(report.control('platformStockBoxes').readOnly).toBe(false);
    expect(report.control('product.unitCost').readOnly).toBe(false);

    report.setInput('platformStockBoxes', '456');
    const input = report.api.currentInput();
    const months = report.api.getDashboard().scenarios.baseline.months;
    expect(forecastInventoryValues(report.chart())).toEqual(months.map((month: any) => {
      return computeInventoryAssetValue(456 - month.coachOrderBoxes, input.product.unitCost);
    }));
  });

  it('浏览器注入保留 __name 垫片且无 import_ 幽灵别名', () => {
    const report = createBrowserReport();
    expect(report.html).toContain('function __name');
    expect(report.html).not.toMatch(/\bimport_[A-Za-z0-9_$]+\./);
    expect(() => report.api.currentInput()).not.toThrow();
  });

  it('数字输入、滑块、布尔控件和模式切换均不发起网络请求', () => {
    const report = createBrowserReport();
    report.setInput('finance.rent', '16000.25');
    report.setInput('finance.rent', '1.234');
    report.setInput('coaches.monthlyNewUsersPerCoach', '8');
    const checkbox = report.control('staff.autoExpand');
    checkbox.checked = false;
    checkbox.dispatch('change');
    report.importSnapshot(goldenSnapshot());
    report.api.setDataMode('assumption');
    expect(report.network).toEqual({ fetch: 0, xhr: 0 });
    expect(report.html).not.toContain('fetch(');
    expect(report.html).not.toContain('XMLHttpRequest');
  });
});
