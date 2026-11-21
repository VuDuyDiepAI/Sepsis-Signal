"use client";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "@/components/layout/page-container";
import { useClinicalDataset } from "@/lib/manual-store";
import {
  availableLabs,
  formatTime,
  hourLabel,
  percent,
  timeAt,
} from "@/lib/clinical-data";
import { vitalSeriesForChart } from "@/lib/clinical-reasoning";
import type { Encounter } from "@/lib/clinical-types";

type ChartTab = "risk" | "hemo" | "resp";

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
  const [tab, setTab] = useState<ChartTab>("risk");
  const dataset = useClinicalDataset(encounter.id);
  const predictions = dataset.predictions.filter(
    (p) => p.encounterId === encounter.id && p.hour <= hour,
  );
  const onsetHour = onset
    ? (new Date(onset).getTime() - new Date(encounter.t0).getTime()) / 3600000
    : undefined;
  const series = vitalSeriesForChart(encounter, hour, dataset);
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
  const maxScore = Math.min(
    1,
    Math.max(0.1, threshold * 1.5, ...predictions.map((p) => p.score * 1.25)),
  );
  const xMax = Math.max(1, hour, onsetHour ?? 0);

  function handleChartClick(state: { activeLabel?: string | number } | null) {
    if (state?.activeLabel !== undefined) {
      const h = Number(state.activeLabel);
      if (Number.isFinite(h) && h >= 0 && h <= hour) onHourChange(h);
    }
  }

  return (
    <Panel
      className="timeline-panel"
      title="Diễn biến theo thời gian"
      description="Nhấp vào một mốc trên biểu đồ để xem lại dữ liệu tại giờ đó."
      meta={`${predictions.length} bản dự báo`}
    >
      <div className="chart-toolbar">
        <div
          className="chart-tabs"
          role="tablist"
          aria-label="Lớp biểu đồ diễn biến"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "risk"}
            className={`chart-tab ${tab === "risk" ? "active" : ""}`}
            onClick={() => setTab("risk")}
          >
            Nguy cơ Sepsis (6h)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "hemo"}
            className={`chart-tab ${tab === "hemo" ? "active" : ""}`}
            onClick={() => setTab("hemo")}
          >
            Huyết động (Mạch & HATT)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "resp"}
            className={`chart-tab ${tab === "resp" ? "active" : ""}`}
            onClick={() => setTab("resp")}
          >
            Hô hấp & Nhiệt độ
          </button>
        </div>
      </div>

      <div className="panel-body" style={{ paddingLeft: 8, paddingRight: 14 }}>
        <div
          className="chart-wrap"
          role="img"
          aria-label={
            tab === "risk"
              ? `Biểu đồ nguy cơ đến ${hourLabel(hour)}, ngưỡng ${percent(threshold)}`
              : tab === "hemo"
                ? `Biểu đồ mạch và huyết áp tâm thu đến ${hourLabel(hour)}`
                : `Biểu đồ nhịp thở và nhiệt độ đến ${hourLabel(hour)}`
          }
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            {tab === "risk" ? (
              <LineChart
                data={series}
                margin={{ top: 18, right: 15, left: 0, bottom: 8 }}
                onClick={handleChartClick}
              >
                <CartesianGrid stroke="#e6edf3" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="hour"
                  domain={[0, xMax]}
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: "#475569" }}
                  tickFormatter={(h) => `${h}h`}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, maxScore]}
                  tickFormatter={(v) => `${Math.round(v * 100)}%`}
                  width={52}
                  tick={{ fontSize: 12, fill: "#475569" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  labelFormatter={(h) =>
                    `${hourLabel(Number(h))} · ${formatTime(timeAt(encounter.t0, Number(h)), true)}`
                  }
                  formatter={(v) => [
                    typeof v === "number" ? percent(v) : "Chưa có điểm",
                    "Nguy cơ Sepsis 6h",
                  ]}
                  contentStyle={{
                    borderRadius: 6,
                    borderColor: "#dce3ec",
                    fontSize: 13,
                  }}
                />
                <ReferenceLine
                  y={threshold}
                  stroke="#d97706"
                  strokeDasharray="5 4"
                />
                <ReferenceLine
                  x={hour}
                  stroke="#94a3b8"
                  strokeDasharray="3 4"
                />
                {onsetHour !== undefined && (
                  <ReferenceLine
                    x={onsetHour}
                    stroke="#b91c1c"
                    strokeDasharray="4 4"
                    label={{
                      value: "Khởi phát tham chiếu",
                      position: "insideTopRight",
                      fontSize: 12,
                      fill: "#b91c1c",
                    }}
                  />
                )}
                {labHours.map((h) => (
                  <ReferenceDot
                    key={h}
                    x={h}
                    y={0}
                    r={3.5}
                    fill="#475569"
                    stroke="#ffffff"
                  />
                ))}
                <Line
                  type="linear"
                  dataKey="score"
                  stroke="#0369a1"
                  strokeWidth={2.5}
                  connectNulls={false}
                  isAnimationActive={false}
                  dot={{ r: 3, fill: "#ffffff", strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            ) : tab === "hemo" ? (
              <LineChart
                data={series}
                margin={{ top: 18, right: 15, left: 0, bottom: 8 }}
                onClick={handleChartClick}
              >
                <CartesianGrid stroke="#e6edf3" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="hour"
                  domain={[0, xMax]}
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: "#475569" }}
                  tickFormatter={(h) => `${h}h`}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[40, 180]}
                  width={48}
                  tick={{ fontSize: 12, fill: "#475569" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  labelFormatter={(h) =>
                    `${hourLabel(Number(h))} · ${formatTime(timeAt(encounter.t0, Number(h)), true)}`
                  }
                  formatter={(v, name) => {
                    if (typeof v !== "number") return ["Chưa đo", String(name)];
                    return name === "hr"
                      ? [`${v.toFixed(0)} l/p`, "Mạch (eForm)"]
                      : [`${v.toFixed(0)} mmHg`, "HA tâm thu (eForm)"];
                  }}
                  contentStyle={{
                    borderRadius: 6,
                    borderColor: "#dce3ec",
                    fontSize: 13,
                  }}
                />
                <ReferenceLine
                  y={100}
                  stroke="#d97706"
                  strokeDasharray="5 4"
                />
                <ReferenceLine
                  x={hour}
                  stroke="#94a3b8"
                  strokeDasharray="3 4"
                />
                {onsetHour !== undefined && (
                  <ReferenceLine
                    x={onsetHour}
                    stroke="#b91c1c"
                    strokeDasharray="4 4"
                  />
                )}
                <Line
                  type="linear"
                  dataKey="hr"
                  name="hr"
                  stroke="#dc2626"
                  strokeWidth={2.2}
                  connectNulls
                  isAnimationActive={false}
                  dot={{ r: 3, fill: "#ffffff", strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="linear"
                  dataKey="sbp"
                  name="sbp"
                  stroke="#0369a1"
                  strokeWidth={2.2}
                  connectNulls
                  isAnimationActive={false}
                  dot={{ r: 3, fill: "#ffffff", strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            ) : (
              <LineChart
                data={series}
                margin={{ top: 18, right: 12, left: 0, bottom: 8 }}
                onClick={handleChartClick}
              >
                <CartesianGrid stroke="#e6edf3" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="hour"
                  domain={[0, xMax]}
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: "#475569" }}
                  tickFormatter={(h) => `${h}h`}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="rr"
                  domain={[8, 40]}
                  width={42}
                  tick={{ fontSize: 12, fill: "#0369a1" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="temp"
                  orientation="right"
                  domain={[35, 41]}
                  width={42}
                  tick={{ fontSize: 12, fill: "#d97706" }}
                  tickFormatter={(v) => `${v}°`}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  labelFormatter={(h) =>
                    `${hourLabel(Number(h))} · ${formatTime(timeAt(encounter.t0, Number(h)), true)}`
                  }
                  formatter={(v, name) => {
                    if (typeof v !== "number") return ["Chưa đo", String(name)];
                    return name === "rr"
                      ? [`${v.toFixed(0)} l/p`, "Nhịp thở (eForm)"]
                      : [`${v.toFixed(1)} °C`, "Nhiệt độ (eForm)"];
                  }}
                  contentStyle={{
                    borderRadius: 6,
                    borderColor: "#dce3ec",
                    fontSize: 13,
                  }}
                />
                <ReferenceLine
                  yAxisId="rr"
                  y={22}
                  stroke="#0369a1"
                  strokeDasharray="4 4"
                />
                <ReferenceLine
                  yAxisId="rr"
                  x={hour}
                  stroke="#94a3b8"
                  strokeDasharray="3 4"
                />
                {onsetHour !== undefined && (
                  <ReferenceLine
                    yAxisId="rr"
                    x={onsetHour}
                    stroke="#b91c1c"
                    strokeDasharray="4 4"
                  />
                )}
                <Line
                  yAxisId="rr"
                  type="linear"
                  dataKey="rr"
                  name="rr"
                  stroke="#0369a1"
                  strokeWidth={2.2}
                  connectNulls
                  isAnimationActive={false}
                  dot={{ r: 3, fill: "#ffffff", strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  yAxisId="temp"
                  type="linear"
                  dataKey="temp"
                  name="temp"
                  stroke="#d97706"
                  strokeWidth={2.2}
                  connectNulls
                  isAnimationActive={false}
                  dot={{ r: 3, fill: "#ffffff", strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-key">
        {tab === "risk" ? (
          <>
            <span>
              <i className="keyline" />
              Nguy cơ Sepsis 6h
            </span>
            <span>
              <i className="keyline threshold" />
              Ngưỡng cảnh báo ({percent(threshold)})
            </span>
            <span>
              <i className="keyline lab" />
              Mốc có xét nghiệm trả (Labtc)
            </span>
          </>
        ) : tab === "hemo" ? (
          <>
            <span>
              <i
                className="keyline"
                style={{ background: "var(--clinical-critical-accent)" }}
              />
              Mạch (l/p)
            </span>
            <span>
              <i className="keyline" />
              HA tâm thu (mmHg)
            </span>
            <span>
              <i className="keyline threshold" />
              Mốc HATT 100 mmHg (qSOFA)
            </span>
          </>
        ) : (
          <>
            <span>
              <i className="keyline" />
              Nhịp thở (l/p · mốc 22 qSOFA)
            </span>
            <span>
              <i className="keyline threshold" />
              Nhiệt độ (°C)
            </span>
          </>
        )}
      </div>
    </Panel>
  );
}
