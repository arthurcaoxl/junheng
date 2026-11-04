import { describe, expect, it } from 'vitest';
import { channelUnitEconomics, monthlyCustomerValue, monthlyRecurringBoxes } from '../src/economics';
import { settleCoachOrder, settleCoachRewards } from '../src/economics';
import { sampleInput } from './fixtures';

describe('真实物理与双渠道经济', () => {
  it('月复购盒数与月均消费严格由袋数推导', () => {
    const input = sampleInput();
    expect(monthlyRecurringBoxes(input.product)).toBeCloseTo(30 / 21, 10);
    expect(monthlyCustomerValue(input.product)).toBeCloseTo((30 / 21) * 660, 8);
  });

  it('教练满奖励时最终贡献 170，直营贡献 500，二者不混用', () => {
    const input = sampleInput();
    const coach = channelUnitEconomics(input, 'coach');
    const direct = channelUnitEconomics(input, 'direct');
    expect(coach.coachDifferencePerBox).toBe(198);
    expect(coach.rewardPerBox).toBe(132);
    expect(coach.platformContributionPerBox).toBe(170);
    expect(direct.rewardPerBox).toBe(0);
    expect(direct.coachEarningsPerBox).toBe(0);
    expect(direct.platformContributionPerBox).toBe(500);
  });

  it('奖励未达条件时不计提，员工绩效来自实际教练收益', () => {
    const input = sampleInput();
    input.coaches.dataRewardEligibleRate = 0;
    input.coaches.referralRewardEligibleRate = 0.5;
    const eco = channelUnitEconomics(input, 'coach');
    expect(eco.rewardPerBox).toBe(33);
    expect(eco.coachEarningsPerBox).toBe(231);
    expect(eco.staffPerformancePerBox).toBeCloseTo(23.1, 8);
    expect(eco.platformContributionPerBox).toBe(269);
  });
});

describe('教练拿货与奖励账本', () => {
  it('新教练首箱为 24×462=11088，货到库且奖励抵扣只减少现金', () => {
    const input = sampleInput();
    const order = settleCoachOrder(1, 0, true, 2000, input.product, input.coaches);
    expect(order.orderedBoxes).toBe(24);
    expect(order.firstCaseBoxes).toBe(24);
    expect(order.standardPayment).toBe(11088);
    expect(order.rewardOffsetUsed).toBe(2000);
    expect(order.cashPayment).toBe(9088);
    expect(order.inventoryAfterOrder).toBe(24);
    expect(order.rewardBalanceAfterOrder).toBe(0);
  });

  it('未到补货点不拿货，到补货点按 cohort 教练数补整箱', () => {
    const input = sampleInput();
    expect(settleCoachOrder(2, 25, false, 0, input.product, input.coaches).orderedBoxes).toBe(0);
    expect(settleCoachOrder(2, 24, false, 0, input.product, input.coaches).orderedBoxes).toBe(48);
  });

  it('奖励按实际售出和达标率计提，抵扣部分形成负债，剩余当月付现', () => {
    const input = sampleInput();
    const reward = settleCoachRewards(10, 100, input.product, input.coaches);
    expect(reward.dataReward).toBe(660);
    expect(reward.referralReward).toBe(660);
    expect(reward.rewardOffsetAccrued).toBe(660);
    expect(reward.rewardCash).toBe(660);
    expect(reward.rewardBalanceAfterSale).toBe(760);
    expect(reward.coachDifference).toBe(1980);
    expect(reward.coachEarnings).toBe(3300);
  });

  it('直营销量调用教练奖励结算不属于引擎路径，零销量不得产生奖励', () => {
    const input = sampleInput();
    const reward = settleCoachRewards(0, 0, input.product, input.coaches);
    expect(reward.coachEarnings).toBe(0);
    expect(reward.rewardCash).toBe(0);
    expect(reward.rewardBalanceAfterSale).toBe(0);
  });

  it('负库存代表状态损坏，必须明确报错而不是静默归零', () => {
    const input = sampleInput();
    expect(() => settleCoachOrder(1, -1, false, 0, input.product, input.coaches)).toThrowError('库存不得为负数');
  });

  it('奖励余额超过拿货应付时，抵扣以应付金额为上限', () => {
    const input = sampleInput();
    const order = settleCoachOrder(1, 0, true, 20000, input.product, input.coaches);
    expect(order.standardPayment).toBe(11088);
    expect(order.rewardOffsetUsed).toBe(11088);
    expect(order.cashPayment).toBe(0);
    expect(order.rewardBalanceAfterOrder).toBe(8912);
  });

  it('零销量不产生新奖励，并保留既有奖励余额', () => {
    const input = sampleInput();
    const reward = settleCoachRewards(0, 100, input.product, input.coaches);
    expect(reward.rewardOffsetAccrued).toBe(0);
    expect(reward.rewardCash).toBe(0);
    expect(reward.rewardBalanceAfterSale).toBe(100);
  });
});
