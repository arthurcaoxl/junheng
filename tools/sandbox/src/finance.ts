export interface InventoryCashFlowParams {
  coachPickupBoxes: number;
  platformStockBoxes: number;
  unitCost: number;
  coachPickupPrice: number;
}

export interface InventoryKpiParams extends InventoryCashFlowParams {
  stockoutBoxes: number;
  revenuePerBox: number;
}

export function computeInventoryAssetValue(inventoryBoxes: number, unitCost: number = 160): number {
  return Math.max(0, inventoryBoxes) * unitCost;
}

export function computeStockoutOpportunityCost(stockoutBoxes: number, revenuePerBox: number): number {
  return Math.max(0, stockoutBoxes) * revenuePerBox;
}

export function computeInventoryCashFlow(params: InventoryCashFlowParams) {
  const { coachPickupBoxes, platformStockBoxes, unitCost, coachPickupPrice } = params;

  const coachReceipts = coachPickupBoxes * coachPickupPrice;
  const platformStockCost = platformStockBoxes * unitCost;
  const netCashImpact = coachReceipts - platformStockCost;

  // 平台未发出的库存盒数 = 平台备货 - 教练拿货，且不能为负
  const unsoldStockBoxes = Math.max(0, platformStockBoxes - coachPickupBoxes);
  const inventoryCapitalOccupied = unsoldStockBoxes * unitCost;

  return {
    coachReceipts,
    platformStockCost,
    netCashImpact,
    inventoryCapitalOccupied,
  };
}

export function computeInventoryKpis(params: InventoryKpiParams) {
  const { platformStockBoxes, coachPickupBoxes, stockoutBoxes, unitCost, revenuePerBox, coachPickupPrice } = params;

  const unsoldStockBoxes = Math.max(0, platformStockBoxes - coachPickupBoxes);
  const inventoryAssetValue = computeInventoryAssetValue(unsoldStockBoxes, unitCost);
  const stockoutOpportunityCost = computeStockoutOpportunityCost(stockoutBoxes, revenuePerBox);
  const inventoryCashFlow = computeInventoryCashFlow({ coachPickupBoxes, platformStockBoxes, unitCost, coachPickupPrice });

  return {
    inventoryAssetValue,
    stockoutOpportunityCost,
    inventoryCashFlow,
  };
}
