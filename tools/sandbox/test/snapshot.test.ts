import { describe, expect, it } from 'vitest';
import { computeInventoryKpis } from '../src/finance';
import { generateReport } from '../src/html-generator';
import { sampleInput } from './fixtures';
import {
  createSnapshotImporter,
  importSnapshotJson,
  standardizeSnapshot,
  validateSnapshot,
} from '../src/snapshot';

type SnapshotError = Error & {
  code?: string;
  issues?: Array<{ code?: string; field?: string }>;
};

function goldenSnapshot() {
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
      sourceRefs: [
        {
          sourceEventId: 'pickup-2026-10',
          revision: 1,
          occurredAt: '2026-10-15T04:00:00.000Z',
        },
      ],
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
      coachReceipts: [
        {
          sourceEventId: 'receipt-2026-10',
          revision: 1,
          occurredAt: '2026-10-20T06:00:00.000Z',
          amount: { amountMinor: 3300000, currency: 'CNY' },
          orderRef: 'order-opaque-1',
          kind: 'receipt',
        },
      ],
      procurementPayments: [
        {
          sourceEventId: 'payment-2026-10',
          revision: 1,
          occurredAt: '2026-10-10T06:00:00.000Z',
          amount: { amountMinor: 3200000, currency: 'CNY' },
          purchaseRef: 'purchase-opaque-1',
          kind: 'payment',
        },
      ],
    },
    dataQuality: {
      status: 'complete',
      issues: [],
      missingFields: [],
      duplicateSourceEventIds: [],
    },
  };
}

function mutableSnapshot(): any {
  return JSON.parse(JSON.stringify(goldenSnapshot()));
}

function errorFromValidation(input: unknown): SnapshotError {
  try {
    validateSnapshot(input);
  } catch (error) {
    return error as SnapshotError;
  }
  throw new Error('预期快照校验失败，但实际通过了');
}

function errorFromJson(raw: string): SnapshotError {
  try {
    importSnapshotJson(raw);
  } catch (error) {
    return error as SnapshotError;
  }
  throw new Error('预期快照导入失败，但实际通过了');
}

describe('阶段 A：人工 JSON 快照导入与契约校验', () => {
  it('黄金样例可导入、标准化，并保持库存与缺货财务口径', () => {
    const snapshot = importSnapshotJson(JSON.stringify(goldenSnapshot()));
    const standardized = standardizeSnapshot(snapshot);

    expect(standardized).toMatchObject({
      platformStockBoxes: 270,
      coachPickupBoxes: 150,
      stockoutBoxes: 10,
      unitCost: 160,
      coachPickupPrice: 220,
      revenuePerBox: 660,
    });

    const kpis = computeInventoryKpis(standardized);
    expect(kpis.inventoryAssetValue).toBe(19200);
    expect(kpis.stockoutOpportunityCost).toBe(6600);
    expect(snapshot.inventory.closingPlatformBoxes).toBe(120);
    expect(snapshot.inventory.coachClosingBoxes).toBe(40);
  });

  it.each([
    'schemaVersion',
    'snapshotId',
    'source',
    'generatedAt',
    'asOf',
    'periodStart',
    'periodEnd',
    'timezone',
    'sourceRevision',
    'inventory',
    'coachOrders',
    'productPricing',
    'cashMovements',
    'dataQuality',
  ])('缺少必填顶层字段 %s 时严格阻断', (field) => {
    const snapshot = mutableSnapshot();
    delete snapshot[field];

    const error = errorFromValidation(snapshot);
    expect(error.code).toBe('REQUIRED_FIELD');
    expect(error.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })])
    );
  });

  it.each([
    'openingPlatformBoxes',
    'inboundBoxes',
    'otherOutboundBoxes',
    'authorizedAdjustmentBoxes',
    'closingPlatformBoxes',
  ])('实际模式缺少库存必填字段 %s 时拒绝导入', (field) => {
    const snapshot = mutableSnapshot();
    delete snapshot.inventory[field];
    expect(errorFromValidation(snapshot).code).toBe('REQUIRED_FIELD');
  });

  it('实际库存缺失时绝不回退到 200 盒默认假设', () => {
    const snapshot = mutableSnapshot();
    delete snapshot.inventory.closingPlatformBoxes;

    expect(errorFromValidation(snapshot).code).toBe('REQUIRED_FIELD');
    expect(JSON.stringify(snapshot)).not.toContain('"platformStockBoxes":200');
  });

  it('平台库存勾稽失败时报告 INVENTORY_MISMATCH', () => {
    const snapshot = mutableSnapshot();
    snapshot.inventory.closingPlatformBoxes = 121;
    snapshot.inventory.physicalCountBoxes = 121;

    expect(errorFromValidation(snapshot).code).toBe('INVENTORY_MISMATCH');
  });

  it('实盘数与合法流水推导值不一致时拒绝静默调平', () => {
    const snapshot = mutableSnapshot();
    snapshot.inventory.physicalCountBoxes = 119;

    expect(errorFromValidation(snapshot).code).toBe('INVENTORY_MISMATCH');
  });

  it('教练库存字段只提供一部分时严格阻断', () => {
    const snapshot = mutableSnapshot();
    delete snapshot.inventory.coachClosingBoxes;

    expect(errorFromValidation(snapshot).code).toBe('REQUIRED_FIELD');
  });

  it('教练库存勾稽失败时与平台库存异常分开报告', () => {
    const snapshot = mutableSnapshot();
    snapshot.inventory.coachClosingBoxes = 41;

    expect(errorFromValidation(snapshot).code).toBe('COACH_INVENTORY_MISMATCH');
  });

  it('实际拿货大于可供库存时不能用 max(0, ...) 隐藏异常', () => {
    const snapshot = mutableSnapshot();
    snapshot.coachOrders.pickedUpBoxes = 300;
    snapshot.coachOrders.allocatedBoxes = 300;
    snapshot.coachOrders.orderedBoxes = 300;
    snapshot.inventory.coachClosingBoxes = 190;

    expect(errorFromValidation(snapshot).code).toBe('INVENTORY_MISMATCH');
  });

  it('来源不完整导致拿货大于可供库存时报告 INCOMPLETE_SOURCE', () => {
    const snapshot = mutableSnapshot();
    snapshot.coachOrders.pickedUpBoxes = 300;
    snapshot.coachOrders.allocatedBoxes = 300;
    snapshot.coachOrders.orderedBoxes = 300;
    snapshot.dataQuality.status = 'degraded';
    snapshot.dataQuality.missingFields = ['inventory.inboundBoxes'];

    expect(errorFromValidation(snapshot).code).toBe('INCOMPLETE_SOURCE');
  });

  it('分配量超过可供分配库存时报告 OVERSOLD_ALLOCATION', () => {
    const snapshot = mutableSnapshot();
    snapshot.coachOrders.allocatedBoxes = 271;

    expect(errorFromValidation(snapshot).code).toBe('OVERSOLD_ALLOCATION');
  });

  it.each([
    ['inventory.openingPlatformBoxes', -1],
    ['inventory.inboundBoxes', 1.5],
    ['coachOrders.pickedUpBoxes', -1],
    ['coachOrders.stockoutBoxes', 2.5],
  ])('拒绝非法盒数 %s = %s', (path, value) => {
    const snapshot = mutableSnapshot();
    const [parent, field] = path.split('.');
    snapshot[parent][field] = value;

    expect(errorFromValidation(snapshot).code).toBe('INVALID_NUMBER');
  });

  it('拒绝 NaN、Infinity 和超安全整数金额', () => {
    const nanSnapshot = mutableSnapshot();
    nanSnapshot.productPricing.unitCostMinor = Number.NaN;
    const infinitySnapshot = mutableSnapshot();
    infinitySnapshot.productPricing.unitCostMinor = Number.POSITIVE_INFINITY;
    const unsafeSnapshot = mutableSnapshot();
    unsafeSnapshot.productPricing.unitCostMinor = Number.MAX_SAFE_INTEGER + 1;

    expect(errorFromValidation(nanSnapshot).code).toBe('INVALID_NUMBER');
    expect(errorFromValidation(infinitySnapshot).code).toBe('INVALID_NUMBER');
    expect(errorFromValidation(unsafeSnapshot).code).toBe('INVALID_NUMBER');
  });

  it('拒绝负数、小数金额和非 CNY 币种', () => {
    const negative = mutableSnapshot();
    negative.productPricing.unitCostMinor = -1;
    const fractional = mutableSnapshot();
    fractional.productPricing.coachPickupPriceMinor = 22000.5;
    const wrongCurrency = mutableSnapshot();
    wrongCurrency.productPricing.currency = 'USD';

    expect(errorFromValidation(negative).code).toBe('INVALID_NUMBER');
    expect(errorFromValidation(fractional).code).toBe('INVALID_NUMBER');
    expect(errorFromValidation(wrongCurrency).code).toBe('INVALID_CURRENCY');
  });

  it('只接受毫秒精度 UTC ISO 8601 服务端时间点', () => {
    const localTime = mutableSnapshot();
    localTime.generatedAt = '2026-11-01 10:00:00';
    const noMilliseconds = mutableSnapshot();
    noMilliseconds.generatedAt = '2026-11-01T02:00:00Z';

    expect(errorFromValidation(localTime).code).toBe('INVALID_TIME');
    expect(errorFromValidation(noMilliseconds).code).toBe('INVALID_TIME');
  });

  it('拒绝倒置期间、非法时区和期间外业务事件', () => {
    const reversed = mutableSnapshot();
    [reversed.periodStart, reversed.periodEnd] = [reversed.periodEnd, reversed.periodStart];
    const badTimezone = mutableSnapshot();
    badTimezone.timezone = 'Shanghai';
    const outsideEvent = mutableSnapshot();
    outsideEvent.coachOrders.sourceRefs[0].occurredAt = '2026-11-01T00:00:00.000Z';

    expect(errorFromValidation(reversed).code).toBe('INVALID_PERIOD');
    expect(errorFromValidation(badTimezone).code).toBe('INVALID_TIMEZONE');
    expect(errorFromValidation(outsideEvent).code).toBe('EVENT_OUTSIDE_PERIOD');
  });

  it('同事件同修订同内容的重复记录去重并留下审计标记', () => {
    const snapshot = mutableSnapshot();
    snapshot.cashMovements.coachReceipts.push(
      JSON.parse(JSON.stringify(snapshot.cashMovements.coachReceipts[0]))
    );
    snapshot.dataQuality.status = 'degraded';
    snapshot.dataQuality.duplicateSourceEventIds = ['receipt-2026-10'];

    const imported = validateSnapshot(snapshot);
    expect(imported.cashMovements.coachReceipts).toHaveLength(1);
    expect(imported.dataQuality.duplicateSourceEventIds).toContain('receipt-2026-10');
  });

  it('同事件 ID 出现不同内容时报告重复冲突', () => {
    const snapshot = mutableSnapshot();
    const duplicate = JSON.parse(JSON.stringify(snapshot.cashMovements.coachReceipts[0]));
    duplicate.amount.amountMinor += 1;
    snapshot.cashMovements.coachReceipts.push(duplicate);

    expect(errorFromValidation(snapshot).code).toBe('DUPLICATE_EVENT_CONFLICT');
  });

  it('相同快照重复导入返回首次结果，保持幂等与可重现性', () => {
    const importer = createSnapshotImporter();
    const raw = JSON.stringify(goldenSnapshot());

    const first = importer.importJson(raw);
    const second = importer.importJson(raw);

    expect(second).toBe(first);
    expect(second.generatedAt).toBe('2026-11-01T02:00:00.000Z');
  });

  it('同一 snapshotId 对应不同载荷时报告 SNAPSHOT_CONFLICT', () => {
    const importer = createSnapshotImporter();
    importer.importJson(JSON.stringify(goldenSnapshot()));
    const conflict = mutableSnapshot();
    conflict.inventory.inboundBoxes = 201;
    conflict.inventory.closingPlatformBoxes = 121;
    conflict.inventory.physicalCountBoxes = 121;

    expect(errorFromJsonWithImporter(importer, JSON.stringify(conflict)).code).toBe(
      'SNAPSHOT_CONFLICT'
    );
  });

  it('同一 sourceRevision 对应不同载荷时报告上游修订冲突', () => {
    const importer = createSnapshotImporter();
    importer.importJson(JSON.stringify(goldenSnapshot()));
    const conflict = mutableSnapshot();
    conflict.snapshotId = 'snapshot-2026-10-r1-copy';
    conflict.inventory.inboundBoxes = 201;
    conflict.inventory.closingPlatformBoxes = 121;
    conflict.inventory.physicalCountBoxes = 121;

    expect(errorFromJsonWithImporter(importer, JSON.stringify(conflict)).code).toBe(
      'SOURCE_REVISION_CONFLICT'
    );
  });

  it('新修订通过新快照和 supersedesSnapshotId 保留修正链', () => {
    const importer = createSnapshotImporter();
    importer.importJson(JSON.stringify(goldenSnapshot()));
    const revision = mutableSnapshot();
    revision.snapshotId = 'snapshot-2026-10-r2';
    revision.sourceRevision = 'ledger-revision-2';
    revision.supersedesSnapshotId = 'snapshot-2026-10-r1';
    revision.generatedAt = '2026-11-01T03:00:00.000Z';

    const imported = importer.importJson(JSON.stringify(revision));
    expect(imported.supersedesSnapshotId).toBe('snapshot-2026-10-r1');
    expect(imported.sourceRevision).toBe('ledger-revision-2');
  });

  it('可选缺货与价格缺失时标为未知，不得静默写成 0', () => {
    const snapshot = mutableSnapshot();
    delete snapshot.coachOrders.stockoutBoxes;
    delete snapshot.productPricing.revenuePerBoxMinor;
    snapshot.dataQuality.status = 'degraded';
    snapshot.dataQuality.missingFields = [
      'coachOrders.stockoutBoxes',
      'productPricing.revenuePerBoxMinor',
    ];

    const standardized = standardizeSnapshot(validateSnapshot(snapshot));
    expect(standardized.stockoutBoxes).toBeUndefined();
    expect(standardized.revenuePerBox).toBeUndefined();
    expect(standardized.stockoutBoxes).not.toBe(0);
    expect(standardized.revenuePerBox).not.toBe(0);
  });

  it('拒绝不支持的主版本，不猜测迁移语义', () => {
    const snapshot = mutableSnapshot();
    snapshot.schemaVersion = '2.0';
    expect(errorFromValidation(snapshot).code).toBe('UNSUPPORTED_SCHEMA_VERSION');
  });

  it('拒绝 userCode、邮箱、联系方式和支付原始报文进入快照', () => {
    for (const [field, value] of [
      ['userCode', 'local-user-1'],
      ['email', 'person@example.com'],
      ['phone', '13800000000'],
      ['paymentPayload', '{"raw":"secret"}'],
    ]) {
      const snapshot = mutableSnapshot();
      snapshot[field] = value;
      expect(errorFromValidation(snapshot).code).toBe('SENSITIVE_FIELD');
    }
  });

  it(' malformed JSON 返回稳定错误码，不执行其中内容', () => {
    expect(errorFromJson('{not-json').code).toBe('INVALID_JSON');
    expect(errorFromJson('{"schemaVersion":"1.0","__proto__":{"polluted":true}}').code).toBe(
      'REQUIRED_FIELD'
    );
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

function errorFromJsonWithImporter(
  importer: ReturnType<typeof createSnapshotImporter>,
  raw: string
): SnapshotError {
  try {
    importer.importJson(raw);
  } catch (error) {
    return error as SnapshotError;
  }
  throw new Error('预期快照导入失败，但实际通过了');
}

describe('阶段 A：报告 UI 导入闭环', () => {
  const html = generateReport(sampleInput());

  it('提供 JSON 文件上传、粘贴导入、状态提示和实际／假设模式切换', () => {
    expect(html).toContain('id="snapshot-file"');
    expect(html).toContain('accept=".json,application/json"');
    expect(html).toContain('id="snapshot-json"');
    expect(html).toContain('id="import-snapshot"');
    expect(html).toContain('id="snapshot-status"');
    expect(html).toContain('role="status"');
    expect(html).toContain('data-data-mode="actual"');
    expect(html).toContain('data-data-mode="assumption"');
    expect(html).toContain('实际模式');
    expect(html).toContain('假设模式');
  });

  it('通过 fn.toString() 注入完整快照闭包，浏览器同源导入黄金样例', () => {
    const match = html.match(
      /\/\* SNAPSHOT_BROWSER_BEGIN \*\/([\s\S]*?)\/\* SNAPSHOT_BROWSER_END \*\//
    );
    expect(match).not.toBeNull();
    const browser = new Function(
      `${match?.[1]}; return { createSnapshotImporter, importSnapshotJson, standardizeSnapshot };`
    )() as {
      createSnapshotImporter: typeof createSnapshotImporter;
      importSnapshotJson: typeof importSnapshotJson;
      standardizeSnapshot: typeof standardizeSnapshot;
    };

    const importer = browser.createSnapshotImporter();
    const imported = importer.importJson(JSON.stringify(goldenSnapshot()));
    expect(browser.standardizeSnapshot(imported)).toMatchObject({
      platformStockBoxes: 270,
      coachPickupBoxes: 150,
      stockoutBoxes: 10,
      unitCost: 160,
      coachPickupPrice: 220,
      revenuePerBox: 660,
    });
    expect(importer.importJson(JSON.stringify(goldenSnapshot()))).toBe(imported);
    expect(html).toContain('SNAPSHOT_BROWSER_FUNCTIONS');
  });

  it('滑块重算参数在实际模式使用快照，在假设模式使用既有推演与 200 盒假设', () => {
    const source = html.match(/function resolveInventoryKpiParams\([\s\S]*?\n\}/)?.[0];
    expect(source).toBeTypeOf('string');
    const resolve = new Function(`${source}; return resolveInventoryKpiParams;`)() as (
      mode: 'actual' | 'assumption',
      snapshot: ReturnType<typeof standardizeSnapshot> | null,
      platformStockBoxes: number,
      month: { coachOrderBoxes: number; shortageBoxes: number },
      product: { unitCost: number; boxPrice: number; coachPurchasePrice: number }
    ) => Record<string, number | undefined>;
    const snapshot = standardizeSnapshot(validateSnapshot(goldenSnapshot()));
    const month = { coachOrderBoxes: 120, shortageBoxes: 8 };
    const product = { unitCost: 155, boxPrice: 650, coachPurchasePrice: 460 };

    expect(resolve('actual', snapshot, 270, month, product)).toEqual({
      platformStockBoxes: 270,
      coachPickupBoxes: 150,
      stockoutBoxes: 10,
      unitCost: 160,
      coachPickupPrice: 220,
      revenuePerBox: 660,
    });
    expect(resolve('assumption', snapshot, 200, month, product)).toEqual({
      platformStockBoxes: 200,
      coachPickupBoxes: 120,
      stockoutBoxes: 8,
      unitCost: 155,
      coachPickupPrice: 460,
      revenuePerBox: 650,
    });
    expect(html).toContain('resolveInventoryKpiParams(');
    expect(html).toContain('scheduleRender();');
  });

  it('导入成功与失败均更新安全状态提示，文件读取和滑块路径不发起网络请求', () => {
    expect(html).toContain('function importSnapshotFromText(');
    expect(html).toContain('function setSnapshotStatus(');
    expect(html).toContain('导入成功');
    expect(html).toContain('导入失败');
    expect(html).toContain("snapshotStatus.textContent = message");
    expect(html).toContain("snapshotFile.addEventListener('change'");
    expect(html).toContain("importButton.addEventListener('click'");
    expect(html).not.toContain('fetch(');
    expect(html).not.toContain('XMLHttpRequest');
  });
});
