import React from "react";

export type SparkPoint = {
  snapshotAt: string | Date;
  rank: number | null;
};

const WIDTH = 110;
const HEIGHT = 28;
const PAD_X = 3;
const PAD_Y = 4;
const MAX_RANK = 30; // baseline = 30위. 30위 밖은 baseline.

function yForRank(rank: number | null): number {
  if (rank === null || rank > MAX_RANK) return HEIGHT - PAD_Y;
  const clamped = Math.max(1, rank);
  const ratio = (clamped - 1) / (MAX_RANK - 1);
  return PAD_Y + ratio * (HEIGHT - PAD_Y * 2);
}

export function Sparkline({
  points,
  label,
  color = "var(--accent)",
}: {
  points: SparkPoint[];
  label?: string;
  color?: string;
}) {
  if (points.length === 0) {
    return (
      <div className="sparkline-empty">
        {label ? <span className="spark-label">{label}</span> : null}
        <span className="faint" style={{ fontSize: 11 }}>데이터 부족</span>
      </div>
    );
  }

  const n = points.length;
  const xs = points.map((_, i) => {
    if (n === 1) return WIDTH / 2;
    return PAD_X + (i / (n - 1)) * (WIDTH - PAD_X * 2);
  });
  const ys = points.map((p) => yForRank(p.rank));

  // 30위 안 점들을 polyline으로 잇기, 30위 밖은 회색 점만
  const inRangePoints = points
    .map((p, i) => ({ p, i, x: xs[i], y: ys[i] }))
    .filter((it) => it.p.rank !== null && it.p.rank <= MAX_RANK);
  const polylineCoords = inRangePoints.map((it) => `${it.x.toFixed(1)},${it.y.toFixed(1)}`).join(" ");

  const last = points[n - 1];
  const lastY = ys[n - 1];
  const lastX = xs[n - 1];
  const lastInRange = last.rank !== null && last.rank <= MAX_RANK;

  return (
    <div className="sparkline">
      {label ? <span className="spark-label">{label}</span> : null}
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        aria-label="순위 추이"
      >
        {/* baseline 가이드 */}
        <line
          x1={PAD_X}
          y1={HEIGHT - PAD_Y}
          x2={WIDTH - PAD_X}
          y2={HEIGHT - PAD_Y}
          stroke="var(--border)"
          strokeWidth="1"
          strokeDasharray="2,2"
        />
        {/* polyline (in-range만) */}
        {inRangePoints.length >= 2 && (
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={polylineCoords}
          />
        )}
        {/* 점들 */}
        {points.map((p, i) => {
          const inRange = p.rank !== null && p.rank <= MAX_RANK;
          const isLast = i === n - 1;
          return (
            <circle
              key={i}
              cx={xs[i]}
              cy={ys[i]}
              r={isLast ? 2.5 : 1.6}
              fill={inRange ? color : "var(--text-faint)"}
              opacity={inRange ? 1 : 0.5}
            />
          );
        })}
      </svg>
      <span className="spark-now" style={{ color: lastInRange ? color : "var(--text-faint)" }}>
        {last.rank === null || last.rank > MAX_RANK ? "30+" : `${last.rank}`}
      </span>
      {/* 마지막 위치 강조용 라벨 (last position) */}
      <span style={{ display: "none" }}>{lastX.toFixed(0)}-{lastY.toFixed(0)}</span>
    </div>
  );
}
