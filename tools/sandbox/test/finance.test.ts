import { describe, it, expect } from 'vitest';
import {
  computeInventoryAssetValue,
  computeStockoutOpportunityCost,
  computeInventoryCashFlow,
  computeInventoryKpis,
} from '../src/finance';

describe('沙盘 4.0 库存与资金联动 (纯函数外部注入)', () => {
  it('库存资产化：期末未发出库存盒数 × 160 元单盒成本', () => {
    expect(computeInventoryAssetValue(0)).toBe(0);
    expect(computeInventoryAssetValue(80)).toBe(12800);
    expect(computeInventoryAssetValue(80, 160)).toBe(12800);
  });

  it('缺货机会成本：按缺货盒数 × 单盒销售额损失计算，而不是按库存成本', () => {
    const stockoutBoxes = 10;
    const revenuePerBox = 300;
    const unitCost = 160;

    expect(computeStockoutOpportunityCost(stockoutBoxes, revenuePerBox)).toBe(3000);
    // 明确断言不是按成本价计算的贡献毛益
    expect(computeStockoutOpportunityCost(stockoutBoxes, revenuePerBox)).not.toBe(
      stockoutBoxes * unitCost
    );
  });

  it('现金流修正：教练拿货回款与平台备货资金占用真实匹配', () => {
    // 场景：教练拿货120盒，平台备货200盒，平台未发出库存 = 200 - 120 = 80盒
    const result = computeInventoryCashFlow({
      coachPickupBoxes: 120,
      platformStockBoxes: 200,
      unitCost: 160,
      coachPickupPrice: 220,
    });

    expect(result).toEqual({
      coachReceipts: 26400, // 120 * 220
      platformStockCost: 32000, // 200 * 160
      netCashImpact: -5600, // 26400 - 32000
      inventoryCapitalOccupied: 12800, // (200 - 120) * 160 = 80 * 160
    });
  });

  it('现金流边界：平台备货少于教练拿货时，库存资金占用不为负', () => {
    // 场景：平台备货120盒，教练拿货200盒，相当于平台缺货，但未发出库存不可能是负数
    const result = computeInventoryCashFlow({
      coachPickupBoxes: 200,
      platformStockBoxes: 120,
      unitCost: 160,
      coachPickupPrice: 220,
    });
    expect(result.inventoryCapitalOccupied).toBe(0);
  });

  it('KPI 聚合：同时输出库存货值、缺货机会成本和现金流净影响', () => {
    const kpi = computeInventoryKpis({
      platformStockBoxes: 200,
      coachPickupBoxes: 120,
      stockoutBoxes: 10,
      unitCost: 160,
      revenuePerBox: 300,
      coachPickupPrice: 220,
    });

    expect(kpi.inventoryAssetValue).toBe(12800); // 80 * 160
    expect(kpi.stockoutOpportunityCost).toBe(3000); // 10 * 300
    expect(kpi.inventoryCashFlow).toEqual({
      coachReceipts: 26400,
      platformStockCost: 32000,
      netCashImpact: -5600,
      inventoryCapitalOccupied: 12800,
    });
  });
});
