export interface ResponsePoint {
  at: string;
  valueMs: number | null;
}
interface PlotPoint {
  x: number;
  y: number;
  at: string;
  value: number;
}
export function buildResponsePaths(input: ResponsePoint[], width: number) {
  const left = 40,
    right = Math.max(48, width - 8),
    top = 20,
    bottom = 180;
  const sorted = [
    ...new Map(
      input.filter((p) => Number.isFinite(Date.parse(p.at))).map((p) => [Date.parse(p.at), p]),
    ).entries(),
  ].sort(([a], [b]) => a - b);
  const values = sorted.flatMap(([, p]) => (p.valueMs === null ? [] : [p.valueMs]));
  const max = Math.max(50, Math.ceil(Math.max(0, ...values) / 50) * 50);
  const start = sorted[0]?.[0] ?? 0,
    end = sorted.at(-1)?.[0] ?? start;
  const intervals = sorted
    .slice(1)
    .map(([at], i) => at - sorted[i][0])
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const cadence = intervals.length ? intervals[Math.floor((intervals.length - 1) / 2)] : Infinity;
  const chunks: PlotPoint[][] = [];
  let chunk: PlotPoint[] = [];
  let previous: number | null = null;
  const flush = () => {
    if (chunk.length) chunks.push(chunk);
    chunk = [];
  };
  for (const [at, p] of sorted) {
    if (p.valueMs === null || !Number.isFinite(p.valueMs)) {
      flush();
      previous = null;
      continue;
    }
    if (previous !== null && at - previous > cadence * 2.5) flush();
    chunk.push({
      x:
        end === start ? (left + right) / 2 : left + ((at - start) / (end - start)) * (right - left),
      y: bottom - (p.valueMs / max) * (bottom - top),
      at: p.at,
      value: p.valueMs,
    });
    previous = at;
  }
  flush();
  const segments = chunks.map((points) => {
    const slopes = points.slice(1).map((p, i) => (p.y - points[i].y) / (p.x - points[i].x));
    const tangent = points.map((_, i) => {
      if (i === 0) return slopes[0] ?? 0;
      if (i === points.length - 1) return slopes.at(-1) ?? 0;
      const a = slopes[i - 1],
        b = slopes[i];
      if (a * b <= 0) return 0;
      return Math.sign(a) * Math.min(Math.abs(a), Math.abs(b), Math.abs((a + b) / 2));
    });
    const line =
      `M ${points[0].x} ${points[0].y}` +
      points
        .slice(1)
        .map((p, i) => {
          const a = points[i],
            dx = (p.x - a.x) / 3;
          return ` C ${a.x + dx} ${a.y + tangent[i] * dx},${p.x - dx} ${p.y - tangent[i + 1] * dx},${p.x} ${p.y}`;
        })
        .join('');
    const area = line + ` L ${points.at(-1)!.x} ${bottom} L ${points[0].x} ${bottom} Z`;
    return { line, area, points };
  });
  return { segments, max, left, right, top, bottom, width };
}
