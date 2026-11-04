import type { CoachPolicyInput, ProductInput, SandboxInput } from './schema';

export type Channel = 'coach' | 'direct';

export interface ChannelEconomics {
  coachDifferencePerBox: number;
  rewardPerBox: number;
  coachEarningsPerBox: number;
  platformContributionPerBox: number;
  overheadPerBox: number;
  staffPerformancePerBox: number;
  platformVariableContributionPerBox: number;
}

export function monthlyRecurringBoxes(product: ProductInput): number {
  return product.bagsPerMonth / product.bagsPerBox;
}

export function monthlyCustomerValue(product: ProductInput): number {
  return monthlyRecurringBoxes(product) * product.boxPrice;
}

export function rewardPerBox(product: ProductInput, policy: CoachPolicyInput): number {
  return product.boxPrice * (
    policy.dataRewardRate * policy.dataRewardEligibleRate +
    policy.referralRewardRate * policy.referralRewardEligibleRate
  );
}

export function channelUnitEconomics(input: SandboxInput, channel: Channel): ChannelEconomics {
  const p = input.product;
  const difference = channel === 'coach' ? p.boxPrice - p.coachPurchasePrice : 0;
  const reward = channel === 'coach' ? rewardPerBox(p, input.coaches) : 0;
  const earnings = difference + reward;
  const contribution = channel === 'coach'
    ? p.coachPurchasePrice - p.unitCost - reward
    : p.boxPrice - p.unitCost;
  const overhead = p.boxPrice * input.finance.overheadRate;
  const performance = earnings * input.finance.staffPerformanceRate;
  return {
    coachDifferencePerBox: difference,
    rewardPerBox: reward,
    coachEarningsPerBox: earnings,
    platformContributionPerBox: contribution,
    overheadPerBox: overhead,
    staffPerformancePerBox: performance,
    platformVariableContributionPerBox: contribution - overhead - performance,
  };
}

export interface CoachOrderSettlement {
  orderedBoxes: number; firstCaseBoxes: number; standardPayment: number;
  rewardOffsetUsed: number; cashPayment: number; inventoryAfterOrder: number;
  rewardBalanceAfterOrder: number;
}

export interface CoachRewardSettlement {
  dataReward: number; referralReward: number; rewardOffsetAccrued: number;
  rewardCash: number; rewardBalanceAfterSale: number; coachDifference: number;
  coachEarnings: number;
}

export function settleCoachOrder(
  coaches: number,
  inventory: number,
  newlyActive: boolean,
  rewardBalance: number,
  product: ProductInput,
  policy: CoachPolicyInput,
): CoachOrderSettlement {
  if (inventory < 0) {
    throw new Error('库存不得为负数');
  }
  const shouldOrder = newlyActive || inventory <= coaches * policy.restockPoint;
  const orderedBoxes = shouldOrder ? coaches * product.boxesPerCase : 0;
  const standardPayment = orderedBoxes * product.coachPurchasePrice;
  const rewardOffsetUsed = Math.min(rewardBalance, standardPayment);
  return {
    orderedBoxes,
    firstCaseBoxes: newlyActive ? orderedBoxes : 0,
    standardPayment,
    rewardOffsetUsed,
    cashPayment: standardPayment - rewardOffsetUsed,
    inventoryAfterOrder: inventory + orderedBoxes,
    rewardBalanceAfterOrder: rewardBalance - rewardOffsetUsed,
  };
}

export function settleCoachRewards(
  soldBoxes: number,
  rewardBalanceAfterOrder: number,
  product: ProductInput,
  policy: CoachPolicyInput,
): CoachRewardSettlement {
  const dataReward = soldBoxes * product.boxPrice * policy.dataRewardRate * policy.dataRewardEligibleRate;
  const referralReward = soldBoxes * product.boxPrice * policy.referralRewardRate * policy.referralRewardEligibleRate;
  const totalReward = dataReward + referralReward;
  const rewardOffsetAccrued = totalReward * policy.rewardOffsetRate;
  const coachDifference = soldBoxes * (product.boxPrice - product.coachPurchasePrice);
  return {
    dataReward,
    referralReward,
    rewardOffsetAccrued,
    rewardCash: totalReward - rewardOffsetAccrued,
    rewardBalanceAfterSale: rewardBalanceAfterOrder + rewardOffsetAccrued,
    coachDifference,
    coachEarnings: coachDifference + totalReward,
  };
}
