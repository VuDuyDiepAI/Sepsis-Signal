"use client";
import { useClinicalDataset } from "@/lib/manual-store";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import { Panel } from "@/components/layout/page-container";
import {
  availableLabs,
  hourLabel,
  percent,
  formatTime,
  timeAt,
} from "@/lib/clinical-data";
import type { Encounter } from "@/lib/clinical-types";
export function RiskTimeline({
  encounter,
  hour,
  onHourChange,
  onset,
}: {
  encounter: Encounter;
  hour: number;
  onHourChange: (h: number) => void;
  onset?: string | null;
}) {
  const dataset = useClinicalDataset();
  const predictions = dataset.predictions.filter(
    (p) => p.encounterId === encounter.id && p.hour <= hour,
  );
  const onsetHour = onset
    ? (new Date(onset).getTime() - new Date(encounter.t0).getTime()) / 3600000
    : undefined;
  const points = Array.from({ length: hour + 1 }, (_, h) => ({
    hour: h,
    score: predictions.find((p) => p.hour === h)?.score ?? null,
  }));
  const threshold = dataset.models.sepsis.threshold;
  const labHours = [
    ...new Set(
      availableLabs(encounter.id, hour, dataset).map(
        (l) =>
          (new Date(l.availableAt).getTime() -
            new Date(encounter.t0).getTime()) /
          3600000,
      ),
    ),
  ];
  const max = Math.min(
    1,
    Math.max(0.1, threshold * 1.5, ...predictions.map((p) => p.score * 1.25)),
  );
  return (
    <Panel
      className="timeline-panel"
      title="Diễn biến nguy cơ"
      description="Chọn một điểm để xem lại mốc dự báo."
      meta={`${predictions.length} bản dự báo`}
    >
      <div className="panel-body" style={{ paddingLeft: 8, paddingRight: 14 }}>
        <div
          className="chart-wrap"
          role="img"
          aria-label={`Biểu đồ nguy cơ đến ${hourLabel(hour)}, ngưỡng ${percent(threshold)}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 18, right: 15, left: 0, bottom: 8 }}
              onClick={(state) => {
                if (state?.activeLabel !== undefined) {
                  const h = Number(state.activeLabel);
                  if (Number.isFinite(h) && h <= hour) onHourChange(h);
                }
              }}
            >
              <CartesianGrid stroke="#e6edf3" vertical={false} />
              <XAxis
                type="number"
                dataKey="hour"
                domain={[0, Math.max(1, hour, onsetHour ?? 0)]}
                allowDecimals={false}
                tick={{ fontSize: 12, fill: "#526779" }}
                tickFormatter={(h) => `${h}h`}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, max]}
                tickFormatter={(v) => `${Math.round(v * 100)}%`}
                width={52}
                tick={{ fontSize: 12, fill: "#526779" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                labelFormatter={(h) =>
                  `${hourLabel(Number(h))} · ${formatTime(timeAt(encounter.t0, Number(h)), true)}`
                }
                formatter={(v) => [
                  typeof v === "number" ? percent(v) : "Chưa có điểm",
                  "Điểm sepsis",
                ]}
                contentStyle={{
                  borderRadius: 6,
                  borderColor: "#dce5ed",
                  fontSize: 14,
                }}
              />
              <ReferenceLine
                y={threshold}
                stroke="#b77a1b"
                strokeDasharray="5 4"
              />
              <ReferenceLine x={hour} stroke="#9bb1c1" strokeDasharray="3 4" />
              {onsetHour !== undefined && (
                <ReferenceLine
                  x={onsetHour}
                  stroke="#b3342a"
                  strokeDasharray="4 4"
                  label={{
                    value: "Khởi phát tham chiếu",
                    position: "insideTopRight",
                    fontSize: 12,
                    fill: "#a02c24",
                  }}
                />
              )}
              {labHours.map((h) => (
                <ReferenceDot
                  key={h}
                  x={h}
                  y={0}
                  r={3}
                  fill="#64748b"
                  stroke="white"
                />
              ))}
              <Line
                type="linear"
                dataKey="score"
                stroke="#11738c"
                strokeWidth={2.5}
                connectNulls={false}
                isAnimationActive={false}
                dot={{ r: 3, fill: "white", strokeWidth: 2 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="chart-key">
        <span>
          <i className="keyline" />
          Điểm sepsis
        </span>
        <span>
          <i className="keyline threshold" />
          Ngưỡng cảnh báo
        </span>
        <span>
          <i className="keyline lab" />
          Có xét nghiệm trả
        </span>
      </div>
    </Panel>
  );
}
