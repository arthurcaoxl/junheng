import { describe, expect, it } from 'vitest';
import { simulate } from '../src/engine';
import { generateReport } from '../src/html-generator';
import {
  computeChannelFinancials,
  computeDynamicBEP,
  computeRunwayMetrics,
} from '../src/metrics';
import type { SandboxInput } from '../src/schema';
import { importSnapshotJson } from '../src/snapshot';
import type { SandboxSnapshot } from '../src/snapshot';
import { sampleInput } from './fixtures';

const generateCeoReport = generateReport as unknown as (
  input: SandboxInput,
  snapshots?: SandboxSnapshot[],
  cashWarningLine?: number,
) => string;

function validInventorySnapshot(): SandboxSnapshot {
  return importSnapshotJson(JSON.stringify({
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
  }));
}

function browserScript(html: string): string {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  expect(script).toBeTypeOf('string');
  return script ?? '';
}

function initialCeoCharts(html: string): any {
  const match = html.match(/const INITIAL_CEO_CHARTS = ([\s\S]*?);\n/);
  expect(match).not.toBeNull();
  return JSON.parse(match![1]);
}

function chartPoints(charts: any): any[] {
  return [
    ...charts.channelFinancials,
    ...charts.dynamicBEP,
    ...charts.cashRunway.points,
  ];
}

function expectExclusiveForecastPoints(points: any[]): void {
  expect(points.length).toBeGreaterThan(0);
  for (const point of points) {
    expect(point.isActual).toBeTypeOf('boolean');
    expect(point.isForecast).toBeTypeOf('boolean');
    expect(point.isActual).not.toBe(point.isForecast);
    expect(point.isActual).toBe(false);
    expect(point.isForecast).toBe(true);
  }
}

describe('批次 4：CEO 图表与实虚分界', () => {
  it('注入三项新纯函数并保留 __name 垫片且无幽灵别名', () => {
    const script = browserScript(generateCeoReport(sampleInput()));

    for (const name of ['computeChannelFinancials', 'computeDynamicBEP', 'computeRunwayMetrics']) {
      expect(script.includes(`function ${name}`)).toBe(true);
    }
    expect(script.includes('function __name')).toBe(true);
    expect(script).not.toMatch(/\bimport_[A-Za-z0-9_$]+\./);
  });

  it('三类图表点实虚互斥且库存快照不会伪造实际财务历史', () => {
    const withoutSnapshot = generateCeoReport(sampleInput(), [], 0);
    const withSnapshot = generateCeoReport(sampleInput(), [validInventorySnapshot()], 0);

    for (const html of [withoutSnapshot, withSnapshot]) {
      for (const id of ['channel-financials-chart', 'dynamic-bep-chart', 'runway-cash-chart']) {
        expect(html.includes(`id="${id}"`)).toBe(true);
      }
      const charts = initialCeoCharts(html);
      expectExclusiveForecastPoints(chartPoints(charts));
      for (const point of chartPoints(charts)) {
        if (point.isActual) expect(point.snapshotId).toBe('snapshot-2026-10-r1');
      }
    }
    expect(withSnapshot.includes('snapshot-2026-10-r1')).toBe(true);
  });

  it('图表数值来自纯函数且 Runway 未触线显示超过推演期', () => {
    const input = sampleInput();
    const cashWarningLine = 0;
    const html = generateCeoReport(input, [], cashWarningLine);
    const charts = initialCeoCharts(html);
    const months = simulate(input).months;
    const channels = months.map((month) => computeChannelFinancials(month, input));
    const expectedBEP = months.map((month, index) => computeDynamicBEP(month, input, channels[index]));
    const expectedRunway = computeRunwayMetrics(months, cashWarningLine);
    expect(expectedRunway.runway).toBeNull();

    expect(charts.channelFinancials[0].directRevenue).toBe(channels[0].direct.confirmedRevenue);
    expect(charts.channelFinancials[0].coachRevenue).toBe(channels[0].coach.confirmedRevenue);
    expect(charts.channelFinancials[0].directProductCost).toBe(channels[0].direct.productCost);
    expect(charts.channelFinancials[0].coachProductCost).toBe(channels[0].coach.productCost);
    expect(charts.channelFinancials[0].directCommon).toBe(channels[0].directCommon);
    expect(charts.channelFinancials[0].coachCommon).toBe(channels[0].coachCommon);
    expect(charts.dynamicBEP.map((point: any) => point.users)).toEqual(expectedBEP);
    expect(charts.cashRunway.points.map((point: any) => point.cashBalance)).toEqual(
      months.map((month) => month.cashBalance),
    );
    expect(charts.cashRunway.maxOperatingLoss).toBe(expectedRunway.maxOperatingLoss);
    expect(charts.cashRunway.maxOperatingLossMonth).toBe(expectedRunway.maxOperatingLossMonth);
    expect(charts.cashRunway.maxCashGap).toBe(expectedRunway.maxCashGap);
    expect(charts.cashRunway.runway).toBe(expectedRunway.runway);
    expect(charts.cashRunway.runwayLabel).toBe('超过推演期');

    const script = browserScript(html);
    expect(script.includes('computeChannelFinancials(month, input)')).toBe(true);
    expect(script.includes('computeDynamicBEP(month, input, channelResult)')).toBe(true);
    expect(script.includes('computeRunwayMetrics(months, cashWarningLine)')).toBe(true);
  });

  it('注入脚本不包含网络请求或 Node.js 独有 API', () => {
    const script = browserScript(generateCeoReport(sampleInput()));
    const forbidden = [
      /\bfs\s*\./,
      /\bpath\s*\.\s*(?:join|resolve|dirname|basename|extname)\s*\(/,
      /\bprocess\s*\./,
      /\brequire\s*\(/,
      /\bfetch\s*\(/,
      /\bXMLHttpRequest\b/,
      /\bXHR\b/,
    ];

    for (const pattern of forbidden) expect(script).not.toMatch(pattern);
  });
});
