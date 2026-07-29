"use client";

import { useEffect, useRef, useState } from "react";
import celestialSnapshot from "../celestial-data/snapshot.2026-07-23.json";
import NightSkyCanvas from "./NightSkyCanvas";

const quadrantColors: Record<string, string> = {
  东方青龙: "#9bbfd2",
  北方玄武: "#aab3bb",
  西方白虎: "#d9cda8",
  南方朱雀: "#c98a70",
};

function polarPoint(
  raDegrees: number,
  decDegrees: number,
  centerX: number,
  centerY: number,
  radius: number,
) {
  const angle = raDegrees * Math.PI / 180;
  const distance = ((90 - decDegrees) / 135) * radius;
  return {
    x: centerX + Math.sin(angle) * distance,
    y: centerY - Math.cos(angle) * distance,
  };
}

function drawChart(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * pixelRatio);
  canvas.height = Math.round(rect.height * pixelRatio);

  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(pixelRatio, pixelRatio);

  const width = rect.width;
  const height = rect.height;
  const centerX = width / 2;
  const centerY = height / 2 + 4;
  const radius = Math.min(width, height) * 0.39;
  const isCompact = width < 620;

  context.clearRect(0, 0, width, height);
  context.lineWidth = 1;

  for (const declination of [60, 30, 0, -30]) {
    const ringRadius = ((90 - declination) / 135) * radius;
    context.beginPath();
    context.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
    context.strokeStyle = declination === 0
      ? "rgba(197,165,107,.34)"
      : "rgba(155,191,210,.16)";
    context.setLineDash(declination === 0 ? [] : [3, 5]);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = "rgba(211,225,228,.42)";
    context.font = `${isCompact ? 8 : 10}px "PingFang SC", sans-serif`;
    context.fillText(
      `${declination > 0 ? "+" : ""}${declination}°`,
      centerX + ringRadius + 5,
      centerY + 3,
    );
  }

  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.strokeStyle = "rgba(197,165,107,.42)";
  context.stroke();

  for (let degree = 0; degree < 360; degree += 30) {
    const angle = degree * Math.PI / 180;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(
      centerX + Math.sin(angle) * radius,
      centerY - Math.cos(angle) * radius,
    );
    context.strokeStyle = "rgba(155,191,210,.09)";
    context.stroke();

    const labelRadius = radius + (isCompact ? 12 : 19);
    const labelX = centerX + Math.sin(angle) * labelRadius;
    const labelY = centerY - Math.cos(angle) * labelRadius;
    context.fillStyle = "rgba(211,225,228,.38)";
    context.font = `${isCompact ? 8 : 10}px "PingFang SC", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(`${degree}°`, labelX, labelY);
  }

  context.beginPath();
  context.arc(centerX, centerY, 4, 0, Math.PI * 2);
  context.fillStyle = "#d9c28d";
  context.fill();
  context.fillStyle = "rgba(231,238,237,.62)";
  context.font = `${isCompact ? 9 : 11}px "Songti SC", serif`;
  context.textAlign = "left";
  context.fillText("北天极", centerX + 9, centerY - 2);

  for (const mansion of celestialSnapshot.lunar_mansions) {
    const point = polarPoint(
      mansion.ra_degrees,
      mansion.dec_degrees,
      centerX,
      centerY,
      radius,
    );
    const color = quadrantColors[mansion.quadrant] ?? "#d8e1e1";
    context.beginPath();
    context.arc(point.x, point.y, isCompact ? 2.5 : 3.5, 0, Math.PI * 2);
    context.fillStyle = "#07111f";
    context.fill();
    context.lineWidth = 1.2;
    context.strokeStyle = color;
    context.stroke();

    const onLeft = point.x < centerX;
    context.fillStyle = color;
    context.font = `${isCompact ? 8 : 10}px "Songti SC", serif`;
    context.textAlign = onLeft ? "right" : "left";
    context.textBaseline = "middle";
    context.fillText(
      mansion.name,
      point.x + (onLeft ? -6 : 6),
      point.y,
    );
  }

  for (const luminary of celestialSnapshot.seven_luminaries) {
    const point = polarPoint(
      luminary.ra_hours * 15,
      luminary.dec_degrees,
      centerX,
      centerY,
      radius,
    );
    const bodyRadius = luminary.body === "Moon" ? 8 : luminary.body === "Sun" ? 7 : 5;
    context.beginPath();
    context.arc(point.x, point.y, bodyRadius, 0, Math.PI * 2);
    context.fillStyle = "#c05a3d";
    context.fill();
    if (luminary.body === "Sun" || luminary.body === "Moon") {
      context.beginPath();
      context.arc(point.x, point.y, bodyRadius + 5, 0, Math.PI * 2);
      context.strokeStyle = "rgba(217,194,141,.55)";
      context.stroke();
    }

    context.textAlign = luminary.label_dx < 0 ? "right" : "left";
    context.textBaseline = "middle";
    context.fillStyle = "#e48a68";
    context.font = `600 ${isCompact ? 10 : 13}px "Songti SC", serif`;
    context.fillText(
      luminary.name,
      point.x + luminary.label_dx,
      point.y + luminary.label_dy,
    );
    context.fillStyle = "rgba(231,205,174,.58)";
    context.font = `${isCompact ? 7 : 9}px "PingFang SC", sans-serif`;
    context.fillText(
      luminary.modern_name,
      point.x + luminary.label_dx,
      point.y + luminary.label_dy + (isCompact ? 10 : 13),
    );
  }
}

export default function CelestialChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"polar" | "night">("polar");
  const [nightHour, setNightHour] = useState(22);

  useEffect(() => {
    if (mode !== "polar") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const redraw = () => drawChart(canvas);
    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [mode]);

  const nightTimeLabel =
    nightHour < 24
      ? `7月23日 ${String(nightHour).padStart(2, "0")}:00`
      : `7月24日 ${String(nightHour - 24).padStart(2, "0")}:00`;

  return (
    <figure className="celestial-chart">
      <figcaption>
        <span>当日真实星空</span>
        <strong>
          {mode === "polar"
            ? "二十八宿与七曜 · 北天极居中"
            : `上海夜空 · ${nightTimeLabel}`}
        </strong>
      </figcaption>
      <div className="sky-view-switch" aria-label="星空视图">
        <button
          className={mode === "polar" ? "active" : ""}
          aria-pressed={mode === "polar"}
          onClick={() => setMode("polar")}
        >
          传统星盘
        </button>
        <button
          className={mode === "night" ? "active" : ""}
          aria-pressed={mode === "night"}
          onClick={() => setMode("night")}
        >
          夜晚实景
        </button>
      </div>
      {mode === "polar" ? (
        <>
          <canvas
            ref={canvasRef}
            aria-label="2026年7月23日上海观测时刻的二十八宿距星与日月五星赤道星盘"
          />
          <div className="celestial-legend" aria-hidden="true">
            <span><i className="mansion-dot" />二十八宿距星</span>
            <span><i className="luminary-dot" />七曜当日位置</span>
            <span>赤道坐标 · J2000</span>
          </div>
          <p>
            七曜由现代星历实算；距星采用工作性HIP对应，待古籍版本级证认。
          </p>
        </>
      ) : (
        <>
          <NightSkyCanvas hour={nightHour} />
          <label className="night-time-control">
            <span>夜晚时间</span>
            <input
              type="range"
              min="19"
              max="29"
              step="1"
              value={nightHour}
              onChange={(event) => setNightHour(Number(event.target.value))}
            />
            <strong>{nightTimeLabel}</strong>
          </label>
          <p>
            按上海地平坐标投影；拖动改变视向，悬停查看星体高度与方位。
          </p>
        </>
      )}
    </figure>
  );
}
