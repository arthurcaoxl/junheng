import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as htmlGenerator from '../src/html-generator';
import { SandboxInputSchema } from '../src/schema';
import type { SandboxInput } from '../src/schema';
import { sampleInput } from './fixtures';

const { generateReport } = htmlGenerator;
const { toDisplayPercent, toStoredPercent, isValidMoney } = htmlGenerator as unknown as {
  toDisplayPercent(stored: number): number;
  toStoredPercent(display: number): number;
  isValidMoney(s: string): boolean;
};

const PERCENT_EDGES = [0, -0, -0.25, 1e-7, 0.1 + 0.2, 0.145, Number.NaN, Number.POSITIVE_INFINITY];
const FLOW_PATHS = ['users.extensionRate', 'users.maintenanceRate', 'users.churnRate'] as const;

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
  const runImmediately = (callback: () => void) => {
    callback();
    return 1;
  };
  const api = new Function(
    'document',
    'setTimeout',
    'clearTimeout',
    `${browserScript}; return {
      state,
      currentInput,
      readObjectPath,
      writeObjectPath,
      getDashboard: function () { return dashboard; }
    };`,
  )(document, runImmediately, () => undefined) as {
    state: Record<string, any>;
    currentInput(): SandboxInput;
    readObjectPath(object: any, path: string): any;
    writeObjectPath(object: any, path: string, value: number): void;
    getDashboard(): any;
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
  const committed = (path: string): any => path.split('.').reduce(
    (value: any, key) => value?.[key],
    api.currentInput() as any,
  );

  return {
    api,
    html,
    control,
    setInput,
    committed,
    clickApplyFlow() {
      getElement('apply-flow-rates').dispatch('click');
    },
  };
}

describe('批次 0：百分比函数级收敛', () => {
  it('转换边界覆盖 0、-0、负数、1e-7、0.1+0.2、0.145、NaN、Infinity', () => {
    for (const stored of PERCENT_EDGES) {
      const display = toDisplayPercent(stored);
      const roundTrip = toStoredPercent(display);
      if (Number.isNaN(stored)) {
        expect(Number.isNaN(display)).toBe(true);
        expect(Number.isNaN(roundTrip)).toBe(true);
      } else if (!Number.isFinite(stored)) {
        expect(display).toBe(stored);
        expect(roundTrip).toBe(stored);
      } else if (Object.is(stored, -0)) {
        expect(Object.is(display, -0)).toBe(true);
        expect(Object.is(roundTrip, -0)).toBe(true);
      } else {
        expect(display).toBeCloseTo(stored * 100, 12);
        expect(roundTrip).toBeCloseTo(stored, 12);
      }
    }
  });

  it('round-trip 幂等测试（容差 1e-9）', () => {
    for (const stored of PERCENT_EDGES) {
      const roundTrip = toStoredPercent(toDisplayPercent(stored));
      if (Number.isFinite(stored)) {
        expect(Math.abs(roundTrip - stored), `stored=${stored}`).toBeLessThanOrEqual(1e-9);
      } else {
        expect(Object.is(roundTrip, stored)).toBe(true);
      }
    }
  });

  it('展示、回写与初始渲染统一注入并调用两个转换函数，不保留手写换算', () => {
    const report = createBrowserReport();
    for (const name of ['toDisplayPercent', 'toStoredPercent']) {
      expect(report.html.includes(`function ${name}`), `缺少注入函数 ${name}`).toBe(true);
      expect(report.html.match(new RegExp(`\\b${name}\\(`, 'g'))?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
    const source = readFileSync(new URL('../src/html-generator.ts', import.meta.url), 'utf8');
    for (const legacy of [
      'value * 100',
      'parsed.value / 100',
      'values[index] / 100',
      'rawValue * 100',
      'input.users.monthlyRetention * 100',
      'input.coaches.candidateRate * 100',
      'input.users.extensionRate * 100',
      'input.users.maintenanceRate * 100',
      'input.users.churnRate * 100',
    ]) {
      expect(source.includes(legacy), `残留手写换算：${legacy}`).toBe(false);
    }
  });

  it('三项分流率按存储值满足 schema 的 1e-9 勾稽容差，不用浮点数 === 100', () => {
    const report = createBrowserReport();
    report.setInput(FLOW_PATHS[0], '20.000000005');
    report.setInput(FLOW_PATHS[1], '60');
    report.setInput(FLOW_PATHS[2], '20');
    report.clickApplyFlow();

    expect(report.control(FLOW_PATHS[0]).getAttribute('aria-invalid')).toBe('false');
    const actual = report.committed(FLOW_PATHS[0]);
    const expected = 0.20000000005;
    const diff = Math.abs(actual - expected);
    expect(diff).toBeLessThanOrEqual(1e-9);
    expect(report.committed(FLOW_PATHS[1])).toBe(0.6);
    expect(report.committed(FLOW_PATHS[2])).toBe(0.2);
    expect(() => SandboxInputSchema.parse(report.api.currentInput())).not.toThrow();
    const source = readFileSync(new URL('../src/html-generator.ts', import.meta.url), 'utf8');
    expect(/===\s*100|100\s*===/.test(source)).toBe(false);
  });
});

describe('批次 0：金额格式与最小货币单位安全', () => {
  it('接受指定的合法金额集合', () => {
    for (const raw of ['100', '100.5', '100.50', '0', '0.5', '100.0']) {
      expect(isValidMoney(raw), raw).toBe(true);
    }
  });

  it('拒绝指定的小数、符号、空白、前导零、千分位、科学计数法、非有限数和全角数字', () => {
    for (const raw of [
      '1.234', '1.', '.5', '1.2.3', '-1.23', '', ' 1.23 ', '01.23', '00.5',
      '1,000', '1e5', 'Infinity', 'NaN', '１２３.４５',
    ]) {
      expect(isValidMoney(raw), JSON.stringify(raw)).toBe(false);
    }
  });

  it('换算到最小货币单位必须是安全整数，且不静默取整', () => {
    expect(isValidMoney('90071992547409.91')).toBe(true);
    expect(isValidMoney('90071992547409.92')).toBe(false);
    expect(isValidMoney('999999999999999999999')).toBe(false);
    const source = isValidMoney.toString();
    expect(/\/\^[\s\S]*\$\//.test(source)).toBe(true);
    expect(/Math\.round|toFixed|parseInt/.test(source)).toBe(false);
  });

  it('浏览器展示与校验共用 isValidMoney，正价格字段额外要求大于 0', () => {
    const report = createBrowserReport();
    expect(report.html.match(/function isValidMoney\(/g) ?? []).toHaveLength(1);
    expect(report.html.match(/\bisValidMoney\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);

    const before = report.committed('product.boxPrice');
    report.setInput('product.boxPrice', '01.23');
    expect(report.committed('product.boxPrice')).toBe(before);
    expect(report.control('product.boxPrice').getAttribute('aria-invalid')).toBe('true');

    for (const path of ['product.boxPrice', 'product.coachPurchasePrice', 'product.unitCost']) {
      const previous = report.committed(path);
      report.setInput(path, '0.00');
      expect(report.committed(path)).toBe(previous);
      expect(report.control(path).getAttribute('aria-invalid')).toBe('true');
    }
    report.setInput('finance.rent', '0.00');
    expect(report.committed('finance.rent')).toBe(0);
  });
});

describe('批次 0：统一安全路径读写', () => {
  it('深层字段通过统一路径函数读写', () => {
    const report = createBrowserReport();
    expect(report.api.readObjectPath(report.api.state.values, 'seed.phase1.users')).toBe(20);
    report.api.writeObjectPath(report.api.state.values, 'seed.phase1.users', 42);
    expect(report.api.readObjectPath(report.api.state.values, 'seed.phase1.users')).toBe(42);
  });

  it('读写都拒绝 __proto__、prototype、constructor 危险路径', () => {
    const report = createBrowserReport();
    for (const path of ['__proto__.polluted', 'prototype.polluted', 'constructor.prototype.polluted']) {
      const target = Object.create({ polluted: 0 });
      target.prototype = { polluted: 0 };
      target.constructor = { prototype: { polluted: 0 } };
      expect(() => report.api.readObjectPath(target, path), path).toThrow(/危险路径/);
      expect(() => report.api.writeObjectPath(target, path, 123), path).toThrow(/危险路径/);
    }
    expect(({} as { polluted?: number }).polluted).toBeUndefined();
  });

  it('沙盘 src 全目录不再残留旧 split 路径解析', () => {
    const sourceDir = new URL('../src/', import.meta.url);
    for (const file of readdirSync(sourceDir).filter((name) => name.endsWith('.ts'))) {
      const source = readFileSync(new URL(file, sourceDir), 'utf8');
      expect(/split\('\.'\)|split\("\."\)/.test(source), file).toBe(false);
    }
  });
});
