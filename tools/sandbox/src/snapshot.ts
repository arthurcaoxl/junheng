export type SnapshotIssue = {
  code: string;
  field?: string;
  message: string;
};

export class SnapshotValidationError extends Error {
  readonly code: string;
  readonly issues: SnapshotIssue[];

  constructor(code: string, issues: SnapshotIssue[]) {
    super(issues.map((issue) => issue.message).join('; ') || code);
    this.name = 'SnapshotValidationError';
    this.code = code;
    this.issues = issues;
  }
}

export interface SourceEventRef {
  sourceEventId: string;
  revision: number;
  occurredAt: string;
}

export interface Money {
  amountMinor: number;
  currency: 'CNY';
}

export interface CashMovement extends SourceEventRef {
  amount: Money;
  orderRef?: string;
  purchaseRef?: string;
  kind: 'receipt' | 'refund' | 'payment';
}

export interface SandboxSnapshot {
  schemaVersion: string;
  snapshotId: string;
  source: {
    kind: 'manual-validated' | 'readonly-adapter' | 'precomputed';
    sourceSystem: string;
    dataMode: 'actual' | 'assumption';
    generatorVersion: string;
  };
  generatedAt: string;
  asOf: string;
  periodStart: string;
  periodEnd: string;
  timezone: string;
  sourceRevision: string;
  supersedesSnapshotId?: string;
  inventory: {
    openingPlatformBoxes: number;
    inboundBoxes: number;
    otherOutboundBoxes: number;
    authorizedAdjustmentBoxes: number;
    closingPlatformBoxes: number;
    physicalCountBoxes?: number;
    coachOpeningBoxes?: number;
    coachSoldOrConsumedBoxes?: number;
    coachAdjustmentBoxes?: number;
    coachClosingBoxes?: number;
  };
  coachOrders: {
    orderedBoxes?: number;
    allocatedBoxes?: number;
    pickedUpBoxes: number;
    stockoutBoxes?: number;
    sourceRefs: SourceEventRef[];
  };
  productPricing: {
    currency: 'CNY';
    unitCostMinor?: number;
    coachPickupPriceMinor?: number;
    revenuePerBoxMinor?: number;
    stockoutPriceBasis?: 'terminal-sales' | 'coach-pickup';
    effectiveFrom: string;
    effectiveTo?: string;
    priceRevision: string;
  };
  cashMovements: {
    coachReceipts: CashMovement[];
    procurementPayments: CashMovement[];
  };
  dataQuality: {
    status: 'complete' | 'degraded' | 'rejected';
    issues: SnapshotIssue[];
    missingFields: string[];
    duplicateSourceEventIds: string[];
  };
}

export interface StandardizedSnapshot {
  platformStockBoxes: number;
  coachPickupBoxes: number;
  // These KPI inputs remain dynamically optional: missing source values are undefined at runtime.
  stockoutBoxes: any;
  unitCost: any;
  coachPickupPrice: any;
  revenuePerBox: any;
}

type UnknownRecord = Record<string, unknown>;

const TOP_LEVEL_FIELDS = [
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
] as const;

const SENSITIVE_KEYS = new Set([
  'usercode',
  'email',
  'phone',
  'paymentpayload',
  'rawpaymentpayload',
  'supabaseuid',
  'contact',
  'contactinfo',
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(code: string, field: string | undefined, message: string): never {
  throw new SnapshotValidationError(code, [{ code, field, message }]);
}

function requireFields(record: UnknownRecord, fields: readonly string[], prefix = ''): void {
  const issues: SnapshotIssue[] = [];
  for (const key of fields) {
    if (!Object.prototype.hasOwnProperty.call(record, key) || record[key] === undefined) {
      const field = prefix ? `${prefix}.${key}` : key;
      issues.push({ code: 'REQUIRED_FIELD', field, message: `缺少必填字段 ${field}` });
    }
  }
  if (issues.length > 0) throw new SnapshotValidationError('REQUIRED_FIELD', issues);
}

function requireRecord(value: unknown, field: string): UnknownRecord {
  if (!isRecord(value)) fail('INVALID_SHAPE', field, `${field} 必须是对象`);
  return value;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) fail('INVALID_SHAPE', field, `${field} 必须是数组`);
  return value;
}

function validateString(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    fail('INVALID_VALUE', field, `${field} 必须是非空字符串`);
  }
}

function validateStringArray(value: unknown, field: string): void {
  for (const [index, item] of requireArray(value, field).entries()) {
    validateString(item, `${field}.${index}`);
  }
}

function validateInteger(
  value: unknown,
  field: string,
  options: { signed?: boolean; positive?: boolean } = {}
): void {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    (!options.signed && (value as number) < 0) ||
    (options.positive && (value as number) < 1)
  ) {
    fail('INVALID_NUMBER', field, `${field} 必须是合法安全整数`);
  }
}

function validateOptionalInteger(
  record: UnknownRecord,
  key: string,
  prefix: string,
  options: { signed?: boolean; positive?: boolean } = {}
): void {
  if (record[key] !== undefined) validateInteger(record[key], `${prefix}.${key}`, options);
}

function validateTime(value: unknown, field: string): void {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    fail('INVALID_TIME', field, `${field} 必须是毫秒精度 UTC ISO 8601 时间`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail('INVALID_TIME', field, `${field} 不是有效时间点`);
  }
}

function validateTimezone(value: unknown): void {
  if (typeof value !== 'string') fail('INVALID_TIMEZONE', 'timezone', 'timezone 必须是 IANA 时区');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
  } catch {
    fail('INVALID_TIMEZONE', 'timezone', 'timezone 必须是有效 IANA 时区');
  }
}

function scanSensitiveFields(input: unknown): void {
  const visited = new WeakSet<object>();
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) visit(item, `${path}.${index}`);
      return;
    }
    if (!isRecord(value) || visited.has(value)) return;
    visited.add(value);
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        fail('SENSITIVE_FIELD', childPath, `快照禁止包含敏感字段 ${childPath}`);
      }
      visit(child, childPath);
    }
  };
  visit(input, '');
}

function validateSourceEvent(value: unknown, field: string): void {
  const event = requireRecord(value, field);
  requireFields(event, ['sourceEventId', 'revision', 'occurredAt'], field);
  validateString(event.sourceEventId, `${field}.sourceEventId`);
  validateInteger(event.revision, `${field}.revision`, { positive: true });
  validateTime(event.occurredAt, `${field}.occurredAt`);
}

function validateCashMovement(value: unknown, field: string): void {
  const movement = requireRecord(value, field);
  validateSourceEvent(movement, field);
  requireFields(movement, ['amount', 'kind'], field);
  const amount = requireRecord(movement.amount, `${field}.amount`);
  requireFields(amount, ['amountMinor', 'currency'], `${field}.amount`);
  validateInteger(amount.amountMinor, `${field}.amount.amountMinor`);
  if (amount.currency !== 'CNY') {
    fail('INVALID_CURRENCY', `${field}.amount.currency`, '金额币种必须为 CNY');
  }
  if (movement.orderRef !== undefined) validateString(movement.orderRef, `${field}.orderRef`);
  if (movement.purchaseRef !== undefined) {
    validateString(movement.purchaseRef, `${field}.purchaseRef`);
  }
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).sort().join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deduplicateEvents(snapshot: SandboxSnapshot): void {
  const seen = new Map<string, string>();
  const duplicates = new Set(snapshot.dataQuality.duplicateSourceEventIds);

  const deduplicate = <T extends SourceEventRef>(events: T[], field: string): T[] => {
    const result: T[] = [];
    for (const [index, event] of events.entries()) {
      const serialized = canonicalize(event);
      const previous = seen.get(event.sourceEventId);
      if (previous === undefined) {
        seen.set(event.sourceEventId, serialized);
        result.push(event);
      } else if (previous !== serialized) {
        fail(
          'DUPLICATE_EVENT_CONFLICT',
          `${field}.${index}.sourceEventId`,
          `来源事件 ${event.sourceEventId} 存在不同内容`
        );
      } else {
        duplicates.add(event.sourceEventId);
      }
    }
    return result;
  };

  snapshot.coachOrders.sourceRefs = deduplicate(
    snapshot.coachOrders.sourceRefs,
    'coachOrders.sourceRefs'
  );
  snapshot.cashMovements.coachReceipts = deduplicate(
    snapshot.cashMovements.coachReceipts,
    'cashMovements.coachReceipts'
  );
  snapshot.cashMovements.procurementPayments = deduplicate(
    snapshot.cashMovements.procurementPayments,
    'cashMovements.procurementPayments'
  );
  snapshot.dataQuality.duplicateSourceEventIds = [...duplicates].sort();
  if (snapshot.dataQuality.duplicateSourceEventIds.length > 0 && snapshot.dataQuality.status === 'complete') {
    snapshot.dataQuality.status = 'degraded';
  }
}

function assertEventInsidePeriod(event: SourceEventRef, field: string, start: number, end: number): void {
  const occurredAt = Date.parse(event.occurredAt);
  if (occurredAt < start || occurredAt >= end) {
    fail('EVENT_OUTSIDE_PERIOD', `${field}.occurredAt`, `${field} 不在快照期间内`);
  }
}

export function validateSnapshot(input: unknown): SandboxSnapshot {
  scanSensitiveFields(input);
  const root = requireRecord(input, 'snapshot');
  requireFields(root, TOP_LEVEL_FIELDS);

  if (root.schemaVersion !== '1.0') {
    if (typeof root.schemaVersion === 'string' && /^1\.\d+$/.test(root.schemaVersion)) {
      // Same-major minor versions may only add optional fields; known v1 semantics remain valid.
    } else {
      fail('UNSUPPORTED_SCHEMA_VERSION', 'schemaVersion', '不支持的快照契约主版本');
    }
  }

  for (const field of ['snapshotId', 'sourceRevision'] as const) validateString(root[field], field);
  if (root.supersedesSnapshotId !== undefined) {
    validateString(root.supersedesSnapshotId, 'supersedesSnapshotId');
  }

  const source = requireRecord(root.source, 'source');
  requireFields(source, ['kind', 'sourceSystem', 'dataMode', 'generatorVersion'], 'source');
  if (!['manual-validated', 'readonly-adapter', 'precomputed'].includes(source.kind as string)) {
    fail('INVALID_VALUE', 'source.kind', '未知快照来源类型');
  }
  if (!['actual', 'assumption'].includes(source.dataMode as string)) {
    fail('INVALID_VALUE', 'source.dataMode', '未知数据模式');
  }
  validateString(source.sourceSystem, 'source.sourceSystem');
  validateString(source.generatorVersion, 'source.generatorVersion');

  for (const field of ['generatedAt', 'asOf', 'periodStart', 'periodEnd'] as const) {
    validateTime(root[field], field);
  }
  validateTimezone(root.timezone);
  const periodStart = Date.parse(root.periodStart as string);
  const periodEnd = Date.parse(root.periodEnd as string);
  if (periodEnd <= periodStart) fail('INVALID_PERIOD', 'periodEnd', 'periodEnd 必须晚于 periodStart');

  const inventory = requireRecord(root.inventory, 'inventory');
  requireFields(
    inventory,
    [
      'openingPlatformBoxes',
      'inboundBoxes',
      'otherOutboundBoxes',
      'authorizedAdjustmentBoxes',
      'closingPlatformBoxes',
    ],
    'inventory'
  );
  for (const field of [
    'openingPlatformBoxes',
    'inboundBoxes',
    'otherOutboundBoxes',
    'closingPlatformBoxes',
    'physicalCountBoxes',
    'coachOpeningBoxes',
    'coachSoldOrConsumedBoxes',
    'coachClosingBoxes',
  ]) {
    validateOptionalInteger(inventory, field, 'inventory');
  }
  for (const field of ['authorizedAdjustmentBoxes', 'coachAdjustmentBoxes']) {
    validateOptionalInteger(inventory, field, 'inventory', { signed: true });
  }

  const coachFields = [
    'coachOpeningBoxes',
    'coachSoldOrConsumedBoxes',
    'coachAdjustmentBoxes',
    'coachClosingBoxes',
  ];
  const hasCoachInventory = coachFields.some((field) => inventory[field] !== undefined);
  if (hasCoachInventory) requireFields(inventory, coachFields, 'inventory');

  const coachOrders = requireRecord(root.coachOrders, 'coachOrders');
  requireFields(coachOrders, ['pickedUpBoxes', 'sourceRefs'], 'coachOrders');
  for (const field of ['orderedBoxes', 'allocatedBoxes', 'pickedUpBoxes', 'stockoutBoxes']) {
    validateOptionalInteger(coachOrders, field, 'coachOrders');
  }
  const sourceRefs = requireArray(coachOrders.sourceRefs, 'coachOrders.sourceRefs');
  sourceRefs.forEach((event, index) => validateSourceEvent(event, `coachOrders.sourceRefs.${index}`));

  const pricing = requireRecord(root.productPricing, 'productPricing');
  requireFields(pricing, ['currency', 'effectiveFrom', 'priceRevision'], 'productPricing');
  if (pricing.currency !== 'CNY') {
    fail('INVALID_CURRENCY', 'productPricing.currency', '价格币种必须为 CNY');
  }
  for (const field of ['unitCostMinor', 'coachPickupPriceMinor', 'revenuePerBoxMinor']) {
    validateOptionalInteger(pricing, field, 'productPricing');
  }
  if (
    pricing.stockoutPriceBasis !== undefined &&
    !['terminal-sales', 'coach-pickup'].includes(pricing.stockoutPriceBasis as string)
  ) {
    fail('INVALID_VALUE', 'productPricing.stockoutPriceBasis', '未知缺货价格口径');
  }
  validateTime(pricing.effectiveFrom, 'productPricing.effectiveFrom');
  if (pricing.effectiveTo !== undefined) validateTime(pricing.effectiveTo, 'productPricing.effectiveTo');
  if (
    pricing.effectiveTo !== undefined &&
    Date.parse(pricing.effectiveTo as string) <= Date.parse(pricing.effectiveFrom as string)
  ) {
    fail('INVALID_PERIOD', 'productPricing.effectiveTo', '价格有效期结束必须晚于开始');
  }
  validateString(pricing.priceRevision, 'productPricing.priceRevision');

  const cashMovements = requireRecord(root.cashMovements, 'cashMovements');
  requireFields(cashMovements, ['coachReceipts', 'procurementPayments'], 'cashMovements');
  const receipts = requireArray(cashMovements.coachReceipts, 'cashMovements.coachReceipts');
  const payments = requireArray(
    cashMovements.procurementPayments,
    'cashMovements.procurementPayments'
  );
  receipts.forEach((event, index) => {
    validateCashMovement(event, `cashMovements.coachReceipts.${index}`);
    const kind = (event as UnknownRecord).kind;
    if (!['receipt', 'refund'].includes(kind as string)) {
      fail('INVALID_VALUE', `cashMovements.coachReceipts.${index}.kind`, '未知教练现金事件类型');
    }
  });
  payments.forEach((event, index) => {
    validateCashMovement(event, `cashMovements.procurementPayments.${index}`);
    const kind = (event as UnknownRecord).kind;
    if (!['payment', 'refund'].includes(kind as string)) {
      fail(
        'INVALID_VALUE',
        `cashMovements.procurementPayments.${index}.kind`,
        '未知采购现金事件类型'
      );
    }
  });

  const dataQuality = requireRecord(root.dataQuality, 'dataQuality');
  requireFields(dataQuality, ['status', 'issues', 'missingFields', 'duplicateSourceEventIds'], 'dataQuality');
  if (!['complete', 'degraded', 'rejected'].includes(dataQuality.status as string)) {
    fail('INVALID_VALUE', 'dataQuality.status', '未知数据质量状态');
  }
  requireArray(dataQuality.issues, 'dataQuality.issues');
  validateStringArray(dataQuality.missingFields, 'dataQuality.missingFields');
  validateStringArray(dataQuality.duplicateSourceEventIds, 'dataQuality.duplicateSourceEventIds');

  const snapshot = cloneJson(input) as SandboxSnapshot;
  deduplicateEvents(snapshot);
  snapshot.coachOrders.sourceRefs.forEach((event, index) =>
    assertEventInsidePeriod(event, `coachOrders.sourceRefs.${index}`, periodStart, periodEnd)
  );
  snapshot.cashMovements.coachReceipts.forEach((event, index) =>
    assertEventInsidePeriod(event, `cashMovements.coachReceipts.${index}`, periodStart, periodEnd)
  );
  snapshot.cashMovements.procurementPayments.forEach((event, index) =>
    assertEventInsidePeriod(event, `cashMovements.procurementPayments.${index}`, periodStart, periodEnd)
  );

  const available =
    snapshot.inventory.openingPlatformBoxes +
    snapshot.inventory.inboundBoxes -
    snapshot.inventory.otherOutboundBoxes +
    snapshot.inventory.authorizedAdjustmentBoxes;
  const pickedUp = snapshot.coachOrders.pickedUpBoxes;

  if (pickedUp > available) {
    if (snapshot.dataQuality.missingFields.length > 0) {
      fail('INCOMPLETE_SOURCE', 'coachOrders.pickedUpBoxes', '来源不完整，无法解释实际拿货量');
    }
    fail('INVENTORY_MISMATCH', 'coachOrders.pickedUpBoxes', '实际拿货大于可供库存，账实不符');
  }

  const derivedClosing = available - pickedUp;
  if (derivedClosing !== snapshot.inventory.closingPlatformBoxes || derivedClosing < 0) {
    fail('INVENTORY_MISMATCH', 'inventory.closingPlatformBoxes', '平台期末库存勾稽失败');
  }
  if (
    snapshot.inventory.physicalCountBoxes !== undefined &&
    snapshot.inventory.physicalCountBoxes !== derivedClosing
  ) {
    fail('INVENTORY_MISMATCH', 'inventory.physicalCountBoxes', '实盘数与库存流水推导值不一致');
  }

  if (hasCoachInventory) {
    const coachClosing =
      (snapshot.inventory.coachOpeningBoxes as number) +
      pickedUp -
      (snapshot.inventory.coachSoldOrConsumedBoxes as number) +
      (snapshot.inventory.coachAdjustmentBoxes as number);
    if (coachClosing !== snapshot.inventory.coachClosingBoxes || coachClosing < 0) {
      fail('COACH_INVENTORY_MISMATCH', 'inventory.coachClosingBoxes', '教练期末库存勾稽失败');
    }
  }

  if (
    snapshot.coachOrders.allocatedBoxes !== undefined &&
    snapshot.coachOrders.allocatedBoxes > available
  ) {
    fail('OVERSOLD_ALLOCATION', 'coachOrders.allocatedBoxes', '分配量超过可供分配库存');
  }

  if (snapshot.dataQuality.status === 'rejected') {
    fail('DATA_QUALITY_REJECTED', 'dataQuality.status', '来源已拒绝该快照');
  }

  return snapshot;
}

export function importSnapshotJson(raw: string): SandboxSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail('INVALID_JSON', undefined, '快照不是合法 JSON');
  }
  return validateSnapshot(parsed);
}

export function standardizeSnapshot(snapshot: SandboxSnapshot): StandardizedSnapshot {
  return {
    platformStockBoxes: snapshot.inventory.closingPlatformBoxes + snapshot.coachOrders.pickedUpBoxes,
    coachPickupBoxes: snapshot.coachOrders.pickedUpBoxes,
    stockoutBoxes: snapshot.coachOrders.stockoutBoxes,
    unitCost:
      snapshot.productPricing.unitCostMinor === undefined
        ? undefined
        : snapshot.productPricing.unitCostMinor / 100,
    coachPickupPrice:
      snapshot.productPricing.coachPickupPriceMinor === undefined
        ? undefined
        : snapshot.productPricing.coachPickupPriceMinor / 100,
    revenuePerBox:
      snapshot.productPricing.revenuePerBoxMinor === undefined
        ? undefined
        : snapshot.productPricing.revenuePerBoxMinor / 100,
  };
}

function comparablePayload(snapshot: SandboxSnapshot): string {
  const copy: Partial<SandboxSnapshot> = cloneJson(snapshot);
  delete copy.generatedAt;
  return canonicalize(copy);
}

export function createSnapshotImporter(): {
  importJson(raw: string): SandboxSnapshot;
} {
  const bySnapshotId = new Map<string, { snapshot: SandboxSnapshot; payload: string }>();
  const bySourceRevision = new Map<string, { snapshot: SandboxSnapshot; payload: string }>();

  return {
    importJson(raw: string): SandboxSnapshot {
      const snapshot = importSnapshotJson(raw);
      const payload = comparablePayload(snapshot);
      const sameId = bySnapshotId.get(snapshot.snapshotId);
      if (sameId) {
        if (sameId.payload === payload) return sameId.snapshot;
        fail('SNAPSHOT_CONFLICT', 'snapshotId', '同一 snapshotId 对应不同规范化载荷');
      }
      const sameRevision = bySourceRevision.get(snapshot.sourceRevision);
      if (sameRevision) {
        if (sameRevision.payload === payload) return sameRevision.snapshot;
        fail(
          'SOURCE_REVISION_CONFLICT',
          'sourceRevision',
          '同一 sourceRevision 对应不同规范化载荷'
        );
      }
      const entry = { snapshot, payload };
      bySnapshotId.set(snapshot.snapshotId, entry);
      bySourceRevision.set(snapshot.sourceRevision, entry);
      return snapshot;
    },
  };
}

// Explicit dependency-closure order for HTML fn.toString() injection.
export const SNAPSHOT_BROWSER_FUNCTIONS: Array<{ toString(): string }> = [
  SnapshotValidationError,
  isRecord,
  fail,
  requireFields,
  requireRecord,
  requireArray,
  validateString,
  validateStringArray,
  validateInteger,
  validateOptionalInteger,
  validateTime,
  validateTimezone,
  scanSensitiveFields,
  validateSourceEvent,
  validateCashMovement,
  canonicalize,
  cloneJson,
  deduplicateEvents,
  assertEventInsidePeriod,
  validateSnapshot,
  importSnapshotJson,
  standardizeSnapshot,
  comparablePayload,
  createSnapshotImporter,
];

export const SNAPSHOT_BROWSER_CONSTANTS = {
  TOP_LEVEL_FIELDS,
  SENSITIVE_KEYS: [...SENSITIVE_KEYS],
};
