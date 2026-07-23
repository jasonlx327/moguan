"use client";

import { useState } from "react";

const events = [
  {
    id: "hormuz",
    region: "中东 · 航运",
    title: "霍尔木兹海峡通行态势",
    state: "待接入事实源",
    signal: "水 · 火",
    summary:
      "以通行连续性、船舶密度与官方公告为核心观测点，暂不形成事件结论。",
  },
  {
    id: "panama",
    region: "中美洲 · 贸易",
    title: "巴拿马运河运行状态",
    state: "固定样本",
    signal: "水 · 土",
    summary:
      "观察贸易流动是否正常；预约位、吃水与维护窗口只作为解释异常的二级证据。",
  },
  {
    id: "climate",
    region: "全球 · 气候",
    title: "北半球高温与强对流",
    state: "待接入天气源",
    signal: "火 · 木",
    summary:
      "天气首先作为现实环境呈现；没有直接影响时，墨观必须明确说明未发现关联。",
  },
];

const skyPoints = [
  { label: "紫微垣", x: 50, y: 20, type: "region" },
  { label: "北斗", x: 37, y: 34, type: "asterism" },
  { label: "角宿", x: 72, y: 47, type: "mansion" },
  { label: "心宿", x: 24, y: 62, type: "mansion" },
  { label: "南斗", x: 58, y: 70, type: "asterism" },
  { label: "月", x: 77, y: 27, type: "moon" },
];

export default function Home() {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [activeEvent, setActiveEvent] = useState(events[0]);
  const [inputMode, setInputMode] = useState<"文字" | "链接" | "截图">("文字");

  return (
    <main>
      <section className="sky-hero" id="today">
        <div className="stars stars-a" aria-hidden="true" />
        <div className="stars stars-b" aria-hidden="true" />
        <header className="topbar">
          <a className="brand" href="#today" aria-label="墨观首页">
            <span className="brand-seal">墨</span>
            <span>
              <strong>墨观</strong>
              <small>MOGUAN</small>
            </span>
          </a>
          <nav aria-label="主导航">
            <a className="active" href="#today">今日天地</a>
            <a href="#events">天下事件</a>
            <a href="#method">方法与边界</a>
          </nav>
          <button className="analysis-trigger" onClick={() => setAnalysisOpen(true)}>
            <span>＋</span> 事件研判
          </button>
        </header>

        <div className="hero-copy">
          <div className="eyebrow">
            <span className="pulse" />
            固定日期样本 · 2026 年 7 月 23 日 · 上海
          </div>
          <h1>
            今日天地
            <span>仰观天象，俯察人事</span>
          </h1>
          <p>
            从真实星象进入地球，在天气与公共事实之上，
            用先秦至宋代的分层文献体系理解世界如何变化。
          </p>
        </div>

        <div className="sky-stage" aria-label="中国传统星空界面构型预览">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="north-axis">
            <span>北天极</span>
          </div>
          {skyPoints.map((point) => (
            <div
              className={`sky-point ${point.type}`}
              key={point.label}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
            >
              <i />
              <span>{point.label}</span>
            </div>
          ))}
          <div className="sky-note">
            <span>界面构型预览</span>
            星历位置尚未接入，不作为天象事实
          </div>
        </div>

        <div className="celestial-strip">
          <div>
            <small>时间坐标</small>
            <strong>大暑后 01 日</strong>
          </div>
          <div>
            <small>月相</small>
            <strong>盈凸月 · 样式占位</strong>
          </div>
          <div>
            <small>天气层</small>
            <strong>全球图层待接入</strong>
          </div>
          <div className="truth-label">
            <small>数据状态</small>
            <strong>设计验证，不是当日结论</strong>
          </div>
        </div>
      </section>

      <section className="world-section" id="events">
        <div className="section-heading">
          <div>
            <span>02 / 俯察地理</span>
            <h2>天地之下，正在发生什么</h2>
          </div>
          <p>
            首页只呈现少量重要事件。事实、古典解释与情景推演始终分层展示。
          </p>
        </div>

        <div className="world-grid">
          <div className="earth-panel">
            <div className="earth" aria-label="全球天气视觉占位">
              <div className="earth-grid" />
              <span className="weather-band band-one" />
              <span className="weather-band band-two" />
              <span className="earth-marker marker-a">01</span>
              <span className="earth-marker marker-b">02</span>
              <span className="earth-marker marker-c">03</span>
            </div>
            <div className="earth-caption">
              <span>GLOBAL VIEW</span>
              <strong>天气与事件共同定位</strong>
              <p>当前为视觉占位；真实数据接入后显示来源、更新时间与空间分辨率。</p>
            </div>
          </div>

          <div className="event-list">
            {events.map((event, index) => (
              <button
                className={`event-card ${activeEvent.id === event.id ? "selected" : ""}`}
                key={event.id}
                onClick={() => setActiveEvent(event)}
              >
                <span className="event-index">0{index + 1}</span>
                <span className="event-main">
                  <small>{event.region}</small>
                  <strong>{event.title}</strong>
                  <p>{event.summary}</p>
                </span>
                <span className="event-meta">
                  <em>{event.state}</em>
                  <b>{event.signal}</b>
                </span>
              </button>
            ))}
          </div>
        </div>

        <article className="analysis-card">
          <div className="analysis-title">
            <span>当前观察焦点</span>
            <h3>{activeEvent.title}</h3>
          </div>
          <div className="analysis-columns">
            <div>
              <small>事实层</small>
              <strong>{activeEvent.state}</strong>
              <p>只显示已核验事实、来源观点、未证实信息与未知事项。</p>
            </div>
            <div>
              <small>象理层</small>
              <strong>{activeEvent.signal}</strong>
              <p>五行只描述事件功能与变化阶段，不能成为实体的永久标签。</p>
            </div>
            <div>
              <small>验期层</small>
              <strong>尚未生成推演</strong>
              <p>只有具备时间窗口、触发条件与失效条件时，才进入预测账本。</p>
            </div>
          </div>
        </article>
      </section>

      <section className="method-section" id="method">
        <div className="method-mark">观</div>
        <div>
          <span>03 / 方法与边界</span>
          <h2>先事实，后解释；先解释，后推演。</h2>
          <p>
            墨观不是算命，也不把天象与战争、市场或灾害写成已经获得现代科学证实的因果关系。
            每一项公开分析都要能回到现实来源、古籍原文、时代层级、映射过程与未来复盘。
          </p>
        </div>
        <button onClick={() => setAnalysisOpen(true)}>
          提交一个公共事件
          <small>截图、文字或公开链接</small>
        </button>
      </section>

      {analysisOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setAnalysisOpen(false)}>
          <section
            className="analysis-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="analysis-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="dialog-close" onClick={() => setAnalysisOpen(false)} aria-label="关闭">
              ×
            </button>
            <span className="dialog-kicker">二级能力 · 事件研判</span>
            <h2 id="analysis-dialog-title">把一个公共事件纳入今日天地</h2>
            <p>
              墨观会先识别和核验事实，再补充当日环境、古籍依据与可能情景。
              这里不是问事、起卦或个人成败判断。
            </p>

            <div className="mode-tabs" role="tablist" aria-label="提交方式">
              {(["文字", "链接", "截图"] as const).map((mode) => (
                <button
                  key={mode}
                  className={inputMode === mode ? "active" : ""}
                  onClick={() => setInputMode(mode)}
                  role="tab"
                  aria-selected={inputMode === mode}
                >
                  {mode}
                </button>
              ))}
            </div>

            {inputMode === "文字" && (
              <textarea aria-label="输入事件文字" placeholder="粘贴一段新闻，或描述一个需要研判的公共事件……" />
            )}
            {inputMode === "链接" && (
              <input aria-label="输入公开链接" type="url" placeholder="https://example.com/news" />
            )}
            {inputMode === "截图" && (
              <label className="upload-zone">
                <input type="file" accept="image/*" />
                <strong>选择新闻或社交媒体截图</strong>
                <span>当前 P0 仅验证输入流程，文件不会上传服务器</span>
              </label>
            )}

            <div className="dialog-rule">
              <span>固定分析顺序</span>
              <p>识事 → 验真 → 补全 → 定象 → 推演 → 验期</p>
            </div>
            <button className="submit-analysis" disabled>
              P0 分析链待接入
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
