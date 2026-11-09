import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CampTrendCharts from "../components/admin/CampTrendCharts";
import { buildCampDayMetrics, type AdminCamper, type AdminDayRecord } from "../services/adminCheckin";

type TrendDatum = { day: string; weight: number | null; waist: number | null; participants: number };
type ChartProps = { data: TrendDatum[]; margin: Record<string, number>; children?: React.ReactNode };
type AxisProps = { interval: number; padding: { left: number; right: number } };

const chartProps = vi.hoisted(() => ({ lines: [] as ChartProps[], bars: [] as ChartProps[], axes: [] as AxisProps[] }));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: (props: ChartProps) => { chartProps.lines.push(props); return <>{props.children}</>; },
  BarChart: (props: ChartProps) => { chartProps.bars.push(props); return <>{props.children}</>; },
  XAxis: (props: AxisProps) => { chartProps.axes.push(props); return null; },
  YAxis: () => null,
  Line: () => null,
  Bar: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

function day(weight: string, waist = "80"): AdminDayRecord {
  return { weight, waist, meals: [false, false, false], water: false, movement: false, sleep: false };
}

function fixture(): AdminCamper {
  return {
    authUserId: "uid-d21",
    email: "d21@example.com",
    userCode: "JH-D21",
    startDate: "2026-10-01",
    updatedAt: "2026-10-22T00:00:00Z",
    recordedDays: 2,
    records: {
      "2026-09-30": day("100"),
      "2026-10-01": day("80"),
      "2026-10-21": day("76"),
      "2026-10-22": day("70"),
    },
  };
}

describe("D21 趋势数据与 X 轴", () => {
  it("D21 只映射 startDate + 20，窗口外记录不影响本期基线或 D21", () => {
    const metrics = buildCampDayMetrics([fixture()]);
    expect(metrics).toHaveLength(21);
    expect(metrics[0].avgWeightChangePercent).toBe(0);
    expect(metrics[20]).toMatchObject({ dayIndex: 21, participants: 1, avgWeightChangePercent: -5 });
  });

  it("折线和柱状图共享 21 点映射、边距与完整 D1-D21 刻度", () => {
    chartProps.lines.length = 0;
    chartProps.bars.length = 0;
    chartProps.axes.length = 0;
    const metrics = buildCampDayMetrics([fixture()]);
    render(<CampTrendCharts metrics={metrics} />);

    expect(chartProps.lines[0].data).toHaveLength(21);
    expect(chartProps.bars[0].data).toEqual(chartProps.lines[0].data);
    expect(chartProps.lines[0].data[20]).toMatchObject({ day: "D21", weight: -5, participants: 1 });
    expect(chartProps.lines[0].margin).toEqual(chartProps.bars[0].margin);
    expect(chartProps.axes).toHaveLength(2);
    for (const axis of chartProps.axes) {
      expect(axis.interval).toBe(0);
      expect(axis.padding).toEqual({ left: 12, right: 12 });
    }
  });
});
