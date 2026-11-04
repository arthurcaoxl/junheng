import { describe, expect, it } from 'vitest';
import { generateReport } from '../src/html-generator';
import { sampleInput } from './fixtures';

const html = generateReport(sampleInput());

describe('V7.1 CEO 驾驶舱', () => {
  it('包含六组 CEO 指标、三场景和四个下钻页', () => {
    for (const label of ['现金安全', '月度经营保本', '累计现金回正', '期末现金', '教练健康', '库存与组织预警']) {
      expect(html).toContain(label);
    }
    for (const id of ['users-drilldown', 'coaches-drilldown', 'finance-drilldown', 'staff-drilldown']) {
      expect(html).toContain(`id="${id}"`);
    }
    for (const scenario of ['baseline', 'stress', 'upside']) expect(html).toContain(`data-scenario="${scenario}"`);
  });

  it('完整注入浏览器重算依赖，不在前端复制财务公式', () => {
    for (const name of ['buildDashboard', 'simulate', 'simulateUserMonth', 'settleCoachOrder', 'settleCoachRewards', 'equivalentMaintenanceBEP']) {
      expect(html).toContain(`function ${name}`);
    }
    expect(html).toContain('const BASE_INPUT =');
    expect(html).toContain('buildDashboard(currentInput())');
  });

  it('未达月份显示未达到，图表为手写 SVG，交互为 50ms 防抖', () => {
    expect(html).toContain('未达到');
    expect(html).toContain('function buildChart');
    expect(html).toContain('<svg');
    expect(html).toContain('setTimeout(render, 50)');
    expect(html).not.toContain('echarts');
  });

  it('滑块使用显式 expr，数字框与场景切换均调度重算', () => {
    expect(html).toContain("Number(this.value) + '%'");
    expect(html).toContain("Number(this.value) + ' 人'");
    expect(html).toContain('scheduleRender();');
    expect(html.match(/type="number"/g) ?? []).toHaveLength(6);
    expect(html.match(/type="range"/g) ?? []).toHaveLength(3);
  });

  it('首次渲染保留小数百分比，滑块覆盖合法初始值且不量化', () => {
    const input = sampleInput();
    input.users.monthlyRetention = 0.425;
    input.coaches.candidateRate = 0.375;
    input.coaches.monthlyNewUsersPerCoach = 25;
    const custom = generateReport(input);
    expect(custom).toContain('"retention":42.5');
    expect(custom).toContain('"candidate":37.5');
    expect(custom).toContain('<input type="range" id="sl-retention" min="0" max="100" step="any" value="42.5" />');
    expect(custom).toContain('<input type="range" id="sl-candidate" min="0" max="100" step="any" value="37.5" />');
    expect(custom).toContain('<input type="range" id="sl-acquisition" min="0" max="25" step="any" value="25" />');
  });

  it('数字控件声明员工、种子和非负数输入域', () => {
    expect(html).toContain('<input type="number" id="ci-staff" value="3" min="1" step="1" />');
    expect(html).toContain('<input type="number" id="ci-seed1" value="20" min="0" step="1" />');
    expect(html).toContain('<input type="number" id="ci-seed2" value="80" min="0" step="1" />');
    expect(html).toContain('<input type="number" id="ci-rent" value="15000" min="0" step="any" />');
  });

  it('非法员工和种子输入在推演前被拒绝，合法小数金额保留', () => {
    const source = html.match(/function parseControlValue\([\s\S]*?\n\}/)?.[0];
    expect(source).toBeTypeOf('string');
    const parse = new Function(`${source}; return parseControlValue;`)() as (
      raw: string, min: number, integer: boolean,
    ) => number | null;
    expect(parse('0', 1, true)).toBeNull();
    expect(parse('1.5', 1, true)).toBeNull();
    expect(parse('1', 1, true)).toBe(1);
    expect(parse('0', 0, true)).toBe(0);
    expect(parse('1.5', 0, true)).toBeNull();
    expect(parse('0.5', 0, false)).toBe(0.5);
    expect(parse('-0.5', 0, false)).toBeNull();
    expect(parse('', 0, false)).toBeNull();
    expect(parse('Infinity', 0, false)).toBeNull();
    expect(html).toContain('const value = parseControlValue(this.value,');
  });

  it('财务下钻展示等效维持 BEP，教练 KPI 展示休眠率并解释有效打卡率', () => {
    expect(html).toContain('等效维持用户 BEP');
    expect(html).toContain('result.equivalentMaintenanceBEP[index]');
    expect(html).toContain('m.dormancyRate * 100');
    expect(html).toContain('validRecordRate 是已达到 requiredRecordedDays 要求的聚合占比');
  });

  it('月份差在相等时显示一致，并保留全部 null 组合语义', () => {
    const source = html.match(/function monthDelta\([\s\S]*?\n\}/)?.[0];
    expect(source).toBeTypeOf('string');
    const run = (current: number | null, base: number | null) => new Function(
      `function number(n) { return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 1 }); }\n${source}; return monthDelta(${JSON.stringify(current)}, ${JSON.stringify(base)});`,
    )() as string;
    expect(run(3, 3)).toBe('与基准一致');
    expect(run(null, null)).toBe('与基准均未达到');
    expect(run(null, 3)).toBe('较基准变为未达到');
    expect(run(3, null)).toBe('较基准新达到');
    expect(run(2, 3)).toBe('较基准 提前 1 月');
    expect(run(4, 3)).toBe('较基准 推迟 1 月');
  });

  it('旧虚拟价格、生存线、固定维持收益和固定 BEP 不进入报告', () => {
    for (const forbidden of ['monthPackPrice', 'coachSurvivalLine', 'MAINTAIN_USER_CUT', 'CHURN_RATE_BELOW_LINE', 'deriveInitialCoaches', '>503<']) {
      expect(html).not.toContain(forbidden);
    }
  });
});
