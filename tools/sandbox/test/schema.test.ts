import { describe, expect, it } from 'vitest';
import { SandboxInputSchema } from '../src/schema';
import { rawSample, sampleInput } from './fixtures';

const copy = () => JSON.parse(JSON.stringify(rawSample));

describe('V7.1 输入契约', () => {
  it('接受完整样本且不提供旧字段默认值', () => {
    const parsed = sampleInput();
    expect(parsed.product.bagsPerBox).toBe(21);
    expect(parsed.coaches.supportUsersRequired).toBe(8);
    expect(parsed.horizonMonths).toBe(24);
  });

  it('拒绝虚拟月装、生存线和旧月装占比字段', () => {
    const old = copy();
    old.revenue = { boxPrice: 660, monthPackPrice: 960 };
    old.operations = { monthPackRatio: 0.8, coachSurvivalLine: 10000 };
    expect(SandboxInputSchema.safeParse(old).success).toBe(false);
  });

  it('拒绝分流不闭合', () => {
    const input = copy();
    input.users.maintenanceRate = 0.7;
    expect(() => SandboxInputSchema.parse(input)).toThrow('延伸、维持和流失分流之和必须等于 1');
  });

  it('拒绝非正物理量、负场景系数和非整数员工数', () => {
    const badProduct = copy();
    badProduct.product.bagsPerBox = 0;
    const badScenario = copy();
    badScenario.scenarios.stress.multipliers.retention = -0.1;
    const badStaff = copy();
    badStaff.staff.initialCount = 1.5;
    expect(SandboxInputSchema.safeParse(badProduct).success).toBe(false);
    expect(SandboxInputSchema.safeParse(badScenario).success).toBe(false);
    expect(SandboxInputSchema.safeParse(badStaff).success).toBe(false);
  });
});
