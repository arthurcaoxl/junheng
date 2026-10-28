export type TrendPoint = { day: number; value: number };

export function formatTrendValue(value: number) {
  return String(Number(value.toFixed(2)));
}

export function selectTrendLabelDays(points: TrendPoint[], minimumDayGap = 3) {
  const selected: number[] = [];
  points.forEach((point, index) => {
    if (index === 0) {
      selected.push(point.day);
      return;
    }
    if (index === points.length - 1) {
      while (selected.length > 1 && point.day - selected[selected.length - 1] < minimumDayGap) selected.pop();
      selected.push(point.day);
      return;
    }
    if (point.day - selected[selected.length - 1] >= minimumDayGap) selected.push(point.day);
  });
  return new Set(selected);
}
