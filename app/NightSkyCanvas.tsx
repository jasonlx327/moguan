"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Body,
  Equator,
  Horizon,
  Observer,
} from "astronomy-engine";
import brightStars from "../celestial-data/bright-stars.v0.1.json";

const observer = new Observer(31.2304, 121.4737, 4);
const commonNames: Record<string, string> = {
  "* alf UMi": "北极星",
  "* alf Lyr": "织女星",
  "* alf Aql": "河鼓二",
  "* alf Cyg": "天津四",
  "* alf Boo": "大角星",
  "* alf Sco": "心宿二",
  "* alf Vir": "角宿一",
  "* alf Leo": "轩辕十四",
  "* alf Tau": "毕宿五",
  "* alf Ori": "参宿四",
  "* bet Ori": "参宿七",
  "* alf CMa": "天狼星",
};
const luminaries = [
  { body: Body.Sun, label: "日" },
  { body: Body.Moon, label: "月" },
  { body: Body.Mercury, label: "辰星" },
  { body: Body.Venus, label: "太白" },
  { body: Body.Mars, label: "荧惑" },
  { body: Body.Jupiter, label: "岁星" },
  { body: Body.Saturn, label: "镇星" },
];

type View = { azimuth: number; altitude: number };
type ScreenObject = {
  x: number;
  y: number;
  label: string;
  altitude: number;
  azimuth: number;
  magnitude: number | null;
};
type HoverInfo = ScreenObject | null;

function localNightDate(hour: number) {
  const dayOffset = Math.floor(hour / 24);
  const localHour = hour % 24;
  return new Date(Date.UTC(2026, 6, 23 + dayOffset, localHour - 8, 0, 0));
}

function vectorFromHorizontal(azimuth: number, altitude: number) {
  const az = azimuth * Math.PI / 180;
  const alt = altitude * Math.PI / 180;
  const horizontal = Math.cos(alt);
  return [
    Math.sin(az) * horizontal,
    Math.sin(alt),
    Math.cos(az) * horizontal,
  ] as const;
}

function projectVector(
  vector: readonly number[],
  view: View,
  width: number,
  height: number,
) {
  const yaw = view.azimuth * Math.PI / 180;
  const pitch = view.altitude * Math.PI / 180;
  const forward = [
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ];
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up = [
    -Math.sin(yaw) * Math.sin(pitch),
    Math.cos(pitch),
    -Math.cos(yaw) * Math.sin(pitch),
  ];
  const depth =
    vector[0] * forward[0] +
    vector[1] * forward[1] +
    vector[2] * forward[2];
  if (depth <= 0.12) return null;
  const horizontal =
    vector[0] * right[0] +
    vector[1] * right[1] +
    vector[2] * right[2];
  const vertical =
    vector[0] * up[0] +
    vector[1] * up[1] +
    vector[2] * up[2];
  const focal = Math.min(width, height) * 0.46 / Math.tan(50 * Math.PI / 180);
  return {
    x: width / 2 + (horizontal / depth) * focal,
    y: height / 2 - (vertical / depth) * focal,
    depth,
  };
}

function drawNightSky(
  canvas: HTMLCanvasElement,
  hour: number,
  view: View,
) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const context = canvas.getContext("2d");
  if (!context) return [];
  context.scale(ratio, ratio);

  const width = rect.width;
  const height = rect.height;
  const date = localNightDate(hour);
  const visible: ScreenObject[] = [];
  const gradient = context.createRadialGradient(
    width * 0.5,
    height * 0.42,
    20,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.8,
  );
  gradient.addColorStop(0, "#10283d");
  gradient.addColorStop(0.55, "#071725");
  gradient.addColorStop(1, "#030810");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const horizonPoints = [];
  for (let azimuth = 0; azimuth <= 360; azimuth += 2) {
    const point = projectVector(
      vectorFromHorizontal(azimuth, 0),
      view,
      width,
      height,
    );
    if (point) horizonPoints.push(point);
  }
  if (horizonPoints.length > 1) {
    context.beginPath();
    context.moveTo(horizonPoints[0].x, horizonPoints[0].y);
    for (const point of horizonPoints.slice(1)) {
      context.lineTo(point.x, point.y);
    }
    context.strokeStyle = "rgba(197,165,107,.35)";
    context.lineWidth = 1;
    context.stroke();
  }

  for (const [label, azimuth] of [["北", 0], ["东", 90], ["南", 180], ["西", 270]] as const) {
    const point = projectVector(
      vectorFromHorizontal(azimuth, 1),
      view,
      width,
      height,
    );
    if (!point) continue;
    context.fillStyle = "rgba(217,194,141,.7)";
    context.font = '11px "Songti SC", serif';
    context.textAlign = "center";
    context.fillText(label, point.x, point.y - 7);
  }

  for (const star of brightStars.stars) {
    const horizontal = Horizon(
      date,
      observer,
      star.ra_degrees / 15,
      star.dec_degrees,
      "normal",
    );
    if (horizontal.altitude < -1) continue;
    const point = projectVector(
      vectorFromHorizontal(horizontal.azimuth, horizontal.altitude),
      view,
      width,
      height,
    );
    if (!point || point.x < -12 || point.x > width + 12 || point.y < -12 || point.y > height + 12) {
      continue;
    }
    const brightness = Math.max(0.18, Math.min(1, (5.4 - star.magnitude) / 5.5));
    const radius = Math.max(0.65, 3.2 - (star.magnitude + 1) * 0.42);
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fillStyle = `rgba(224,238,244,${brightness})`;
    context.fill();
    if (star.magnitude < 1.1) {
      context.beginPath();
      context.arc(point.x, point.y, radius + 3, 0, Math.PI * 2);
      context.fillStyle = `rgba(155,191,210,${brightness * 0.12})`;
      context.fill();
    }
    const label = commonNames[star.id] ?? star.id.replace(/^\*\s*/, "");
    visible.push({
      x: point.x,
      y: point.y,
      label,
      altitude: horizontal.altitude,
      azimuth: horizontal.azimuth,
      magnitude: star.magnitude,
    });
    if (commonNames[star.id] && star.magnitude < 1.6) {
      context.fillStyle = "rgba(222,233,235,.55)";
      context.font = '9px "Songti SC", serif';
      context.textAlign = "left";
      context.fillText(commonNames[star.id], point.x + 6, point.y - 5);
    }
  }

  for (const luminary of luminaries) {
    const equatorial = Equator(luminary.body, date, observer, true, true);
    const horizontal = Horizon(
      date,
      observer,
      equatorial.ra,
      equatorial.dec,
      "normal",
    );
    if (horizontal.altitude < -1) continue;
    const point = projectVector(
      vectorFromHorizontal(horizontal.azimuth, horizontal.altitude),
      view,
      width,
      height,
    );
    if (!point) continue;
    context.beginPath();
    context.arc(point.x, point.y, luminary.body === Body.Moon ? 7 : 4.5, 0, Math.PI * 2);
    context.fillStyle = "#d87351";
    context.fill();
    context.fillStyle = "#edaa86";
    context.font = '600 11px "Songti SC", serif';
    context.textAlign = "left";
    context.fillText(luminary.label, point.x + 8, point.y - 5);
    visible.push({
      x: point.x,
      y: point.y,
      label: luminary.label,
      altitude: horizontal.altitude,
      azimuth: horizontal.azimuth,
      magnitude: null,
    });
  }

  context.fillStyle = "rgba(237,244,245,.35)";
  context.font = '9px "PingFang SC", sans-serif';
  context.textAlign = "left";
  context.fillText(
    `视向 ${Math.round(view.azimuth)}° · 仰角 ${Math.round(view.altitude)}°`,
    16,
    height - 16,
  );
  return visible;
}

export default function NightSkyCanvas({ hour }: { hour: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>({ azimuth: 180, altitude: 38 });
  const objectsRef = useRef<ScreenObject[]>([]);
  const dragRef = useRef<{ x: number; y: number; view: View } | null>(null);
  const [hover, setHover] = useState<HoverInfo>(null);
  const [, setRenderVersion] = useState(0);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    objectsRef.current = drawNightSky(canvas, hour, viewRef.current);
  }, [hour]);

  useEffect(() => {
    redraw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  const updateView = (azimuth: number, altitude: number) => {
    viewRef.current = {
      azimuth: ((azimuth % 360) + 360) % 360,
      altitude: Math.max(2, Math.min(88, altitude)),
    };
    redraw();
    setRenderVersion((value) => value + 1);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (dragRef.current) {
      const deltaX = x - dragRef.current.x;
      const deltaY = y - dragRef.current.y;
      updateView(
        dragRef.current.view.azimuth - deltaX * 0.22,
        dragRef.current.view.altitude + deltaY * 0.18,
      );
      setHover(null);
      return;
    }
    const nearest = objectsRef.current
      .map((item) => ({
        item,
        distance: Math.hypot(item.x - x, item.y - y),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    setHover(nearest && nearest.distance <= 12 ? nearest.item : null);
  };

  return (
    <div className="night-sky-view">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label="上海夜晚真实星空，可拖动改变观看方向，方向键也可操作"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            x: event.nativeEvent.offsetX,
            y: event.nativeEvent.offsetY,
            view: { ...viewRef.current },
          };
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}
        onPointerLeave={() => {
          if (!dragRef.current) setHover(null);
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 3;
          if (event.key === "ArrowLeft") updateView(viewRef.current.azimuth - step, viewRef.current.altitude);
          else if (event.key === "ArrowRight") updateView(viewRef.current.azimuth + step, viewRef.current.altitude);
          else if (event.key === "ArrowUp") updateView(viewRef.current.azimuth, viewRef.current.altitude + step);
          else if (event.key === "ArrowDown") updateView(viewRef.current.azimuth, viewRef.current.altitude - step);
          else return;
          event.preventDefault();
        }}
      />
      {hover && (
        <div
          className="sky-tooltip"
          style={{ left: hover.x, top: hover.y }}
        >
          <strong>{hover.label}</strong>
          <span>
            高度 {hover.altitude.toFixed(1)}° · 方位 {hover.azimuth.toFixed(1)}°
            {hover.magnitude === null ? "" : ` · V ${hover.magnitude.toFixed(2)}`}
          </span>
        </div>
      )}
      <button
        className="reset-sky-view"
        onClick={() => updateView(180, 38)}
      >
        回到南天
      </button>
    </div>
  );
}
