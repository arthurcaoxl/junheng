import { describe, expect, it } from 'vitest';
import { computeInventoryAssetValue } from '../src/finance';
import { generateReport } from '../src/html-generator';
import { buildDashboard } from '../src/metrics';
import { sampleInput } from './fixtures';

class FakeElement {
  innerHTML = '';
  textContent = '';
  value = '';
  className = '';
  files: null = null;
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

function createBrowserReport() {
  const input = sampleInput();
  const html = generateReport(input);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  expect(script).toBeTypeOf('string');
  // Vitest's SSR transform adds module namespaces to fn.toString(); real browser output has local functions.
  const browserScript = script?.replace(/__vite_ssr_import_\d+__\./g, '');

  const elements = new Map<string, FakeElement>();
  const getElement = (id: string) => {
    const existing = elements.get(id);
    if (existing) return existing;
    const created = new FakeElement();
    elements.set(id, created);
    return created;
  };
  for (const match of html.matchAll(/<input[^>]*id="([^"]+)"[^>]*value="([^"]*)"[^>]*>/g)) {
    getElement(match[1]).value = match[2];
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
      importSnapshotFromText,
      setDataMode,
      state,
      getActiveSnapshot: function () { return activeSnapshot; }
    };`
  )(document, runImmediately, () => undefined) as {
    importSnapshotFromText(raw: string): void;
    setDataMode(mode: 'actual' | 'assumption'): void;
    state: { dataMode: string; scenario: string; retention: number };
    getActiveSnapshot(): any;
  };

  return {
    api,
    html,
    input,
    chart: () => getElement('inventory-chart').innerHTML,
    chartText: () => getElement('inventory-chart').textContent,
    kpis: () => getElement('kpis').innerHTML,
    status: () => getElement('snapshot-status').textContent,
    importSnapshot(snapshot: any) {
      api.importSnapshotFromText(JSON.stringify(snapshot));
    },
    clickScenario(scenario: string) {
      const button = scenarioButtons.find((item) => item.getAttribute('data-scenario') === scenario);
      if (!button) throw new Error(`未知场景 ${scenario}`);
      button.dispatch('click');
    },
    moveRetention(value: number) {
      const slider = getElement('sl-retention');
      slider.value = String(value);
      slider.dispatch('input');
    },
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

function earlierSnapshot(): any {
  const snapshot = goldenSnapshot();
  snapshot.snapshotId = 'snapshot-2026-09-r1';
  snapshot.sourceRevision = 'ledger-revision-0';
  snapshot.generatedAt = '2026-10-01T02:00:00.000Z';
  snapshot.asOf = '2026-09-30T16:00:00.000Z';
  snapshot.periodStart = '2026-08-31T16:00:00.000Z';
  snapshot.periodEnd = '2026-09-30T16:00:00.000Z';
  snapshot.inventory = {
    openingPlatformBoxes: 50,
    inboundBoxes: 100,
    otherOutboundBoxes: 0,
    authorizedAdjustmentBoxes: 0,
    closingPlatformBoxes: 100,
    physicalCountBoxes: 100,
    coachOpeningBoxes: 10,
    coachSoldOrConsumedBoxes: 35,
    coachAdjustmentBoxes: 0,
    coachClosingBoxes: 25,
  };
  snapshot.coachOrders.pickedUpBoxes = 50;
  snapshot.coachOrders.orderedBoxes = 54;
  snapshot.coachOrders.allocatedBoxes = 50;
  snapshot.coachOrders.stockoutBoxes = 4;
  snapshot.coachOrders.sourceRefs[0].sourceEventId = 'pickup-2026-09';
  snapshot.coachOrders.sourceRefs[0].occurredAt = '2026-09-15T04:00:00.000Z';
  snapshot.productPricing.unitCostMinor = 10000;
  snapshot.productPricing.effectiveFrom = '2026-08-31T16:00:00.000Z';
  snapshot.productPricing.effectiveTo = '2026-09-30T16:00:00.000Z';
  snapshot.cashMovements.coachReceipts[0].sourceEventId = 'receipt-2026-09';
  snapshot.cashMovements.coachReceipts[0].occurredAt = '2026-09-20T06:00:00.000Z';
  snapshot.cashMovements.procurementPayments[0].sourceEventId = 'payment-2026-09';
  snapshot.cashMovements.procurementPayments[0].occurredAt = '2026-09-10T06:00:00.000Z';
  return snapshot;
}

function laterSnapshot(): any {
  const snapshot = goldenSnapshot();
  snapshot.snapshotId = 'snapshot-2026-11-r1';
  snapshot.sourceRevision = 'ledger-revision-2';
  snapshot.generatedAt = '2026-12-01T02:00:00.000Z';
  snapshot.asOf = '2026-11-30T16:00:00.000Z';
  snapshot.periodStart = '2026-10-31T16:00:00.000Z';
  snapshot.periodEnd = '2026-11-30T16:00:00.000Z';
  snapshot.inventory.coachSoldOrConsumedBoxes = 125;
  snapshot.inventory.coachClosingBoxes = 55;
  snapshot.coachOrders.stockoutBoxes = 16;
  snapshot.coachOrders.sourceRefs[0].sourceEventId = 'pickup-2026-11';
  snapshot.coachOrders.sourceRefs[0].occurredAt = '2026-11-15T04:00:00.000Z';
  snapshot.productPricing.effectiveFrom = '2026-10-31T16:00:00.000Z';
  snapshot.productPricing.effectiveTo = '2026-11-30T16:00:00.000Z';
  snapshot.cashMovements.coachReceipts[0].sourceEventId = 'receipt-2026-11';
  snapshot.cashMovements.coachReceipts[0].occurredAt = '2026-11-20T06:00:00.000Z';
  snapshot.cashMovements.procurementPayments[0].sourceEventId = 'payment-2026-11';
  snapshot.cashMovements.procurementPayments[0].occurredAt = '2026-11-10T06:00:00.000Z';
  return snapshot;
}

type TimelinePoint = { attrs: string; html: string };

function timelinePoints(chart: string, kind: 'actual' | 'forecast'): TimelinePoint[] {
  const pattern = new RegExp(`<g data-inventory-point="${kind}"([^>]*)>([\\s\\S]*?)</g>`, 'g');
  return [...chart.matchAll(pattern)].map((match) => ({ attrs: match[1], html: match[2] }));
}

function pointValue(point: TimelinePoint, series: string): number | null {
  const match = point.html.match(new RegExp(`data-series="${series}" data-value="([^"]+)"`));
  return match ? Number(match[1]) : null;
}

function pointValues(points: TimelinePoint[], series: string): Array<number | null> {
  return points.map((point) => pointValue(point, series));
}

function actualIds(chart: string): string[] {
  return timelinePoints(chart, 'actual').map((point) => {
    return point.attrs.match(/data-snapshot-id="([^"]+)"/)?.[1] ?? '';
  });
}

describe('库存图表：实际历史与模拟预测分界', () => {
  it('单个有效快照只贡献一个实际点，不复制到全部 months', () => {
    const report = createBrowserReport();
    report.importSnapshot(goldenSnapshot());

    const actual = timelinePoints(report.chart(), 'actual');
    const forecast = timelinePoints(report.chart(), 'forecast');
    expect(actual).toHaveLength(1);
    expect(actualIds(report.chart())).toEqual(['snapshot-2026-10-r1']);
    expect(pointValues(actual, 'coachClosingBoxes')).toEqual([40]);
    expect(pointValues(actual, 'stockoutBoxes')).toEqual([10]);
    expect(pointValues(actual, 'inventoryAssetValue')).toEqual([19200]);
    expect(forecast).toHaveLength(24);
    expect(report.chart()).toContain('实际快照 1 期；后续为模拟预测，不属于实际经营结果。');
  });

  it('连续导入两个不同期间快照后按 periodEnd 排序并使用各自数据', () => {
    const report = createBrowserReport();
    report.importSnapshot(goldenSnapshot());
    report.importSnapshot(earlierSnapshot());

    const actual = timelinePoints(report.chart(), 'actual');
    expect(actualIds(report.chart())).toEqual(['snapshot-2026-09-r1', 'snapshot-2026-10-r1']);
    expect(pointValues(actual, 'coachClosingBoxes')).toEqual([25, 40]);
    expect(pointValues(actual, 'stockoutBoxes')).toEqual([4, 10]);
    expect(pointValues(actual, 'inventoryAssetValue')).toEqual([10000, 19200]);
    expect(report.chart()).toContain('实际快照 2 期；后续为模拟预测，不属于实际经营结果。');
  });

  it('较早日快照后导入时，最新期间快照仍用于期末 KPI', () => {
    const report = createBrowserReport();
    report.importSnapshot(goldenSnapshot());
    report.importSnapshot(earlierSnapshot());

    expect(report.api.getActiveSnapshot().snapshotId).toBe('snapshot-2026-10-r1');
    expect(report.kpis()).toContain('19,200 元');
    expect(report.kpis()).not.toContain('10,000 元');
  });

  it('预测点来自现有引擎与当前场景输入，不来自实际快照复制', () => {
    const report = createBrowserReport();
    report.importSnapshot(goldenSnapshot());

    const months = buildDashboard(report.input).scenarios.baseline.months;
    const forecast = timelinePoints(report.chart(), 'forecast');
    expect(pointValues(forecast, 'coachClosingBoxes')).toEqual(months.map((month) => month.coachInventory));
    expect(pointValues(forecast, 'stockoutBoxes')).toEqual(months.map((month) => month.shortageBoxes));
    expect(pointValues(forecast, 'inventoryAssetValue')).toEqual(months.map((month) => {
      return computeInventoryAssetValue(200 - month.coachOrderBoxes, report.input.product.unitCost);
    }));
    expect(pointValues(forecast, 'coachClosingBoxes')).not.toEqual(months.map(() => 40));
  });

  it('实际与预测之间有垂直虚线、预测阴影、起点文字和真实期间标签', () => {
    const report = createBrowserReport();
    report.importSnapshot(goldenSnapshot());
    const chart = report.chart();

    expect(chart).toMatch(/<line[^>]*data-inventory-boundary[^>]*stroke-dasharray="[^"]+"/);
    expect(chart).toMatch(/<rect[^>]*data-inventory-forecast-shade/);
    expect(chart).toContain('模拟预测起点');
    expect(chart).toContain('2026-10-31T16:00:00.000Z');
    expect(chart).toContain('模拟预测 第 1 月');
    expect(chart).toContain('实际快照 1 期；后续为模拟预测，不属于实际经营结果。');
  });

  it('实际线为实线、预测线为虚线且不存在普通实线桥接', () => {
    const report = createBrowserReport();
    report.importSnapshot(goldenSnapshot());
    const chart = report.chart();

    expect(chart).toMatch(/<polyline[^>]*data-inventory-line="actual"[^>]*>/);
    expect(chart).toMatch(/<polyline[^>]*data-inventory-line="forecast"[^>]*stroke-dasharray="[^"]+"/);
    expect(chart).not.toMatch(/data-inventory-line="bridge"/);
    const actualLine = chart.match(/<polyline[^>]*data-inventory-line="actual"[^>]*>/)?.[0];
    expect(actualLine).not.toContain('stroke-dasharray');
  });

  it('保留盒数与库存资产金额双 Y 轴并明确图例身份', () => {
    const report = createBrowserReport();
    report.importSnapshot(goldenSnapshot());
    const chart = report.chart();

    expect(chart).toContain('data-axis="y"');
    expect(chart).toContain('data-axis="y1"');
    for (const label of ['实际历史', '模拟预测', '盒数轴', '库存资产金额轴']) {
      expect(chart).toContain(label);
    }
  });

  it('场景切换和滑块变化只更新预测区，实际历史点逐字保持不变', () => {
    const report = createBrowserReport();
    report.importSnapshot(goldenSnapshot());
    report.importSnapshot(earlierSnapshot());
    const actualBefore = JSON.stringify(timelinePoints(report.chart(), 'actual'));
    const forecastBefore = JSON.stringify(timelinePoints(report.chart(), 'forecast'));

    report.clickScenario('stress');
    expect(JSON.stringify(timelinePoints(report.chart(), 'actual'))).toBe(actualBefore);
    expect(JSON.stringify(timelinePoints(report.chart(), 'forecast'))).not.toBe(forecastBefore);

    const forecastAfterScenario = JSON.stringify(timelinePoints(report.chart(), 'forecast'));
    report.moveRetention(55);
    expect(JSON.stringify(timelinePoints(report.chart(), 'actual'))).toBe(actualBefore);
    expect(JSON.stringify(timelinePoints(report.chart(), 'forecast'))).not.toBe(forecastAfterScenario);
  });

  it('恢复假设模式后移除实际历史、预测分界和实际摘要', () => {
    const report = createBrowserReport();
    report.importSnapshot(goldenSnapshot());
    report.api.setDataMode('assumption');

    expect(timelinePoints(report.chart(), 'actual')).toHaveLength(0);
    expect(report.chart()).not.toContain('data-inventory-boundary');
    expect(report.chart()).not.toContain('data-inventory-forecast-shade');
    expect(report.chart()).not.toContain('实际快照 1 期');
    expect(report.chart()).toContain('全部为假设／模拟');
  });

  it('同一期间存在无替代关系的快照时提示冲突且不任意绘制', () => {
    const report = createBrowserReport();
    report.importSnapshot(goldenSnapshot());
    const conflict = goldenSnapshot();
    conflict.snapshotId = 'snapshot-2026-10-unrelated';
    conflict.sourceRevision = 'ledger-revision-unrelated';
    conflict.coachOrders.stockoutBoxes = 12;
    report.importSnapshot(conflict);

    expect(report.chart() + report.chartText() + report.status()).toContain('同期快照冲突');
    expect(timelinePoints(report.chart(), 'actual')).toHaveLength(0);
    expect(report.chart()).toContain('data-inventory-conflict');
  });

  it('同期修正快照通过 supersedesSnapshotId 替代旧点且不重复', () => {
    const report = createBrowserReport();
    report.importSnapshot(goldenSnapshot());
    const revision = goldenSnapshot();
    revision.snapshotId = 'snapshot-2026-10-r2';
    revision.sourceRevision = 'ledger-revision-2';
    revision.supersedesSnapshotId = 'snapshot-2026-10-r1';
    revision.coachOrders.stockoutBoxes = 12;
    report.importSnapshot(revision);

    const actual = timelinePoints(report.chart(), 'actual');
    expect(actualIds(report.chart())).toEqual(['snapshot-2026-10-r2']);
    expect(pointValues(actual, 'stockoutBoxes')).toEqual([12]);
  });

  it('supersedesSnapshotId 指向不存在的快照时按冲突处理', () => {
    const report = createBrowserReport();
    const orphanRevision = goldenSnapshot();
    orphanRevision.snapshotId = 'snapshot-2026-10-r2';
    orphanRevision.sourceRevision = 'ledger-revision-2';
    orphanRevision.supersedesSnapshotId = 'snapshot-not-imported';
    report.importSnapshot(orphanRevision);

    expect(report.chart() + report.chartText() + report.status()).toContain('同期快照冲突');
    expect(report.chart()).toContain('data-inventory-conflict');
    expect(timelinePoints(report.chart(), 'actual')).toHaveLength(0);
  });

  it('中间实际期缺少指标时对应实线真正断开，其他系列继续绘制', () => {
    const report = createBrowserReport();
    const degraded = goldenSnapshot();
    delete degraded.coachOrders.stockoutBoxes;
    degraded.dataQuality.status = 'degraded';
    degraded.dataQuality.missingFields = ['coachOrders.stockoutBoxes'];
    report.importSnapshot(earlierSnapshot());
    report.importSnapshot(degraded);
    report.importSnapshot(laterSnapshot());
    const chart = report.chart();

    expect(timelinePoints(chart, 'actual')).toHaveLength(3);
    expect(chart.match(/<polyline[^>]*data-inventory-line="actual"[^>]*data-series-path="stockoutBoxes"/g) ?? []).toHaveLength(0);
    expect(chart.match(/<polyline[^>]*data-inventory-line="actual"[^>]*data-series-path="coachClosingBoxes"/g) ?? []).toHaveLength(1);
    expect(timelinePoints(chart, 'actual')[1].html).toContain('未知');
  });

  it('可选数据缺失显示未知断点，不变为 0 且不使用模拟值补齐', () => {
    const report = createBrowserReport();
    const degraded = goldenSnapshot();
    delete degraded.inventory.coachOpeningBoxes;
    delete degraded.inventory.coachSoldOrConsumedBoxes;
    delete degraded.inventory.coachAdjustmentBoxes;
    delete degraded.inventory.coachClosingBoxes;
    delete degraded.coachOrders.stockoutBoxes;
    delete degraded.productPricing.unitCostMinor;
    degraded.dataQuality.status = 'degraded';
    degraded.dataQuality.missingFields = [
      'inventory.coachClosingBoxes',
      'coachOrders.stockoutBoxes',
      'productPricing.unitCostMinor',
    ];
    report.importSnapshot(degraded);

    const actual = timelinePoints(report.chart(), 'actual');
    expect(actual).toHaveLength(1);
    expect(pointValue(actual[0], 'coachClosingBoxes')).toBeNull();
    expect(pointValue(actual[0], 'stockoutBoxes')).toBeNull();
    expect(pointValue(actual[0], 'inventoryAssetValue')).toBeNull();
    expect(actual[0].html.match(/未知/g) ?? []).toHaveLength(3);
    expect(actual[0].html).not.toContain('data-value="0"');
    expect(pointValues(timelinePoints(report.chart(), 'forecast'), 'stockoutBoxes')).toEqual(
      buildDashboard(report.input).scenarios.baseline.months.map((month) => month.shortageBoxes)
    );
    expect(report.chart() + report.chartText()).toContain('部分实际指标未知');
  });

  it('无实际点的假设图表不显示分界，所有预测标签均有模拟语义', () => {
    const report = createBrowserReport();
    const chart = report.chart();

    expect(timelinePoints(chart, 'actual')).toHaveLength(0);
    expect(timelinePoints(chart, 'forecast')).toHaveLength(24);
    expect(chart).not.toContain('data-inventory-boundary');
    expect(chart).toContain('全部为假设／模拟');
    expect(chart.match(/模拟预测 第 \d+ 月/g) ?? []).toHaveLength(24);
    expect(chart).not.toMatch(/NaN|Infinity/);
  });

  it('单个与多个实际点的 SVG 均不产生非法坐标或布局数值', () => {
    const single = createBrowserReport();
    single.importSnapshot(goldenSnapshot());
    expect(single.chart()).not.toMatch(/NaN|Infinity/);

    const multiple = createBrowserReport();
    multiple.importSnapshot(earlierSnapshot());
    multiple.importSnapshot(goldenSnapshot());
    expect(multiple.chart()).not.toMatch(/NaN|Infinity/);
    expect(timelinePoints(multiple.chart(), 'actual')).toHaveLength(2);
    expect(timelinePoints(multiple.chart(), 'forecast')).toHaveLength(24);
  });

  it('snapshotId 与来源文本经过 HTML／SVG 安全转义', () => {
    const report = createBrowserReport();
    const malicious = goldenSnapshot();
    malicious.snapshotId = 'snapshot"><img src=x onerror=alert(1)>';
    malicious.source.sourceSystem = '</script><script>window.__snapshotXss = true</script>';
    report.importSnapshot(malicious);

    const chart = report.chart();
    expect(chart).not.toContain('<img src=x');
    expect(chart).not.toContain('<script>');
    expect(chart).toContain('&lt;img');
    expect(chart).toContain('&quot;');
    expect(report.html).not.toContain('window.__snapshotXss = true</script>');
  });

  it('fn.toString() 注入在 __name 垫片下完整执行且无幽灵变量', () => {
    expect(() => {
      const report = createBrowserReport();
      report.importSnapshot(goldenSnapshot());
      report.importSnapshot(earlierSnapshot());
      report.clickScenario('upside');
      report.moveRetention(60);
    }).not.toThrow();
  });

  it('不引入网络、主站通信或 Supabase 浏览器路径', () => {
    const report = createBrowserReport();
    for (const forbidden of ['postMessage', 'iframe', 'fetch(', 'XMLHttpRequest', 'Supabase']) {
      expect(report.html).not.toContain(forbidden);
    }
  });
});
