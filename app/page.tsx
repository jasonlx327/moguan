"use client";

import { useState } from "react";
import hormuzSnapshot from "../transit-monitor/current.json";
import hormuzValidation from "../forecast-ledger/validations/FORECAST-2026-07-23-04.current.json";
import ebolaValidation from "../forecast-ledger/validations/FORECAST-2026-07-23-01.current.json";
import ensoValidation from "../forecast-ledger/validations/FORECAST-2026-07-23-03.current.json";
import dailyReview from "../forecast-ledger/daily-reviews/2026-07-24.json";
import forecastLedger from "../forecast-ledger/forecasts/2026-07-23.json";
import passagesRegistry from "../knowledge-base/registries/passages.v0.1.json";
import worksRegistry from "../knowledge-base/registries/works.v0.1.json";
import weatherSnapshot from "../weather-data/current.json";
import CelestialChart from "./CelestialChart";
import ImpactGraph from "./ImpactGraph";

const hormuzLatest = hormuzSnapshot.latest_daily;
const hormuzBaseline30 = hormuzSnapshot.baselines.baseline_30d;
const hormuzBaselineMedian = hormuzBaseline30.median_total_transits;
const hormuzPreCrisisMedian = hormuzSnapshot.baselines.pre_crisis.median_total_transits;
const hormuzNormality =
  hormuzSnapshot.derived_reading.baseline_30d_vs_pre_crisis_median_pct;
const [hormuzYear, hormuzMonth, hormuzDay] = hormuzSnapshot.latest_available_date
  .split("-")
  .map(Number);
const hormuzAsOf = `${hormuzYear} 年 ${hormuzMonth} 月 ${hormuzDay} 日`;
const hormuzHistoryDays = hormuzSnapshot.history_30d.map((day, index) => ({
  date: day.date.slice(5).replace("-", "/"),
  total: day.total_transits,
  showDate: index % 5 === 0 || index === hormuzSnapshot.history_30d.length - 1,
}));
const hormuzChartMax =
  Math.ceil(
    Math.max(hormuzBaselineMedian, ...hormuzHistoryDays.map((day) => day.total)) / 5,
  ) * 5;
const hormuzTrendStatus =
  hormuzBaseline30.first_to_last_7d_change_pct <= -20
    ? "30日趋势走弱"
    : hormuzBaseline30.first_to_last_7d_change_pct >= 20
      ? "30日趋势改善"
      : "30日区间震荡";
const forecastsByEventId = Object.fromEntries(
  forecastLedger.forecasts.map((forecast) => [forecast.event_id, forecast]),
) as Record<string, (typeof forecastLedger.forecasts)[number]>;
const worksById = Object.fromEntries(
  worksRegistry.works.map((work) => [work.work_id, work]),
) as Record<string, (typeof worksRegistry.works)[number]>;
const passagesById = Object.fromEntries(
  passagesRegistry.passages.map((passage) => [passage.passage_id, passage]),
) as Record<string, (typeof passagesRegistry.passages)[number]>;
const validationsByForecastId = Object.fromEntries(
  [ebolaValidation, ensoValidation, hormuzValidation].map(
    (validation) => [validation.forecast_id, validation],
  ),
) as Record<
  string,
  typeof ebolaValidation | typeof ensoValidation | typeof hormuzValidation
>;
const dailyReviewsByEventId = Object.fromEntries(
  dailyReview.reviews.map((review) => [review.event_id, review]),
) as Record<string, (typeof dailyReview.reviews)[number]>;
const weatherValidDate = weatherSnapshot.valid_time.replaceAll("-", " / ");
const dailyReviewDate = dailyReview.review_date.replaceAll("-", " / ");
const dailyReviewAwaitingCount = dailyReview.reviews.filter(
  (review) => review.review_outcome === "maintain_without_new_evidence",
).length;

const events = [
  {
    id: "ebola-drc",
    eventId: "EVENT-2026-07-23-01",
    region: "非洲 · 公共卫生",
    title: "刚果（金）埃博拉疫情持续扩大",
    state: "WHO · 7月17日快照",
    signal: "知识库解释 · 结构类比",
    classicalConcept: "疾疫中的安置、医药与群体照护",
    classicalQuote: "民疾疫者，舍空邸第，为置医药。",
    classicalSource: {
      title: "《汉书·平帝纪》· 元始二年",
      href: "https://zh.wikisource.org/w/index.php?title=漢書/卷012&oldid=7903647",
    },
    modernBridge:
      "古今共享的不是具体医学机制，而是一个制度结构：当疾病超出个人承受范围，住宿、医药与公共组织会成为响应的一部分。",
    interpretationLimits: [
      "史书没有提供病例定义、执行覆盖率或疗效，不能证明该措施等同现代隔离制度。",
      "古代材料不能解释本次埃博拉病毒的传播机制，也不能提供治疗建议。",
      "疫情走势仍应由WHO通报、传播链和现场响应数据判断。",
    ],
    observationWindow: "未来两期 WHO 疫情更新",
    interpretationSupport: "接触者追踪改善、新增传播地区减少、医疗响应安全事件下降",
    interpretationWeakening: "未知传播链增加、跨境传播扩大或医疗设施持续受袭",
    forecast: {
      status: "观察中",
      statusType: "watching",
      validUntil: "2026 年 8 月 6 日",
      readiness: "结算条件完整",
      note: "以未来两期 WHO 更新为结算依据；当前不提供数值概率。",
    },
    summary:
      "病例与死亡数较前次通报显著增加；冲突、人口流动和医疗响应安全正在增加追踪难度。",
    facts: [
      "WHO确认疫情由本迪布焦型埃博拉病毒引起，病例与死亡数较前次通报显著增加。",
      "针对医疗设施和响应人员的安全事件，正在限制部分地区的追踪与救治。",
    ],
    unknowns: [
      "冲突地区的漏报规模",
      "未识别传播链所占比例的最新值",
      "未来两周病例增速是否出现稳定拐点",
    ],
    signals: ["WHO下一期病例与死亡更新", "新增传播地区", "接触者追踪完成率", "医疗响应安全事件"],
    sources: [
      {
        label: "WHO 疫情通报 · 2026-DON613",
        href: "https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON613",
      },
      {
        label: "AP · 医疗响应安全事件",
        href: "https://apnews.com/article/b9facfc24d2da221105f76a5ad2fc2c4",
      },
    ],
    scenarios: [
      {
        name: "响应逐步追上传播",
        trigger: "连续两期增速放缓，接触者追踪改善，新增传播地区减少。",
        invalidation: "出现新的跨境传播或医疗响应持续受阻。",
      },
      {
        name: "传播继续外扩",
        trigger: "新增卫生区、未知传播链和医疗设施安全事件同步增加。",
        invalidation: "病例曲线稳定下降且追踪覆盖恢复。",
      },
    ],
    transitTrend: null,
  },
  {
    id: "el-nino",
    eventId: "EVENT-2026-07-23-04",
    region: "全球 · 气候",
    title: "厄尔尼诺增强，多个地区进入风险准备",
    state: "WMO · 7月17日快照",
    signal: "知识库解释 · 争议映射",
    classicalConcept: "时序、过度与不足",
    classicalQuote: "五者来备，各以其叙，庶草蕃庑。一极备，凶；一极无，凶。",
    classicalSource: {
      title: "《尚书·洪范》· 庶征",
      href: "https://zh.wikisource.org/w/index.php?title=尚書/洪範&oldid=5801741",
    },
    modernBridge:
      "可类比之处是对“时序与失衡”的关注：环境系统并非只看某个变量是否存在，还要看它何时出现、持续多久、是否过强或不足。",
    interpretationLimits: [
      "《洪范》的政治感应部分不能作为现代气候因果。",
      "《论衡·谴告》提醒不能把自然异常直接解释为天意。",
      "天气与五行存在不同配属，本事件不选择唯一五行映射。",
      "事件强度和区域后果必须由WMO、NOAA及观测模型判断。",
    ],
    observationWindow: "2026 年 7—9 月季节更新",
    interpretationSupport: "Niño 3.4指数继续增强，区域异常与季节展望逐步兑现",
    interpretationWeakening: "官方展望下调强度，主要区域异常持续弱于预报",
    forecast: {
      status: "观察中",
      statusType: "watching",
      validUntil: "2026 年 9 月 30 日",
      readiness: "结算条件完整",
      note: "以 WMO、NOAA 及相关官方区域更新为依据；区域影响不合成为单一概率。",
    },
    summary:
      "WMO与NOAA均指向2026年厄尔尼诺继续增强；具体旱涝与高温影响仍须按地区观察。",
    facts: [
      "WMO预报厄尔尼诺将在2026年7月至9月快速发展为强事件。",
      "拉丁美洲多个政府已开始准备水、能源、交通与灾害响应措施。",
    ],
    unknowns: [
      "事件最终强度",
      "各地区温度与降水异常的实际空间分布",
      "2027年全球平均温度受到的具体影响",
    ],
    signals: ["Niño 3.4指数", "南方涛动指数", "WMO季节气候更新", "区域温度与降水异常"],
    sources: [
      {
        label: "WMO · 厄尔尼诺增强预报",
        href: "https://wmo.int/media/news/el-nino-forecast-intensify-increasing-likelihood-of-extreme-weather",
      },
      {
        label: "NOAA CPC · ENSO诊断讨论",
        href: "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml",
      },
    ],
    scenarios: [
      {
        name: "强事件但区域分化",
        trigger: "全球指数继续增强，而区域预报维持显著差异。",
        invalidation: "多个区域同时出现超出季节预报范围的同向异常。",
      },
      {
        name: "跨系统压力上升",
        trigger: "高温、旱涝与水电交通压力在多个重点地区同时兑现。",
        invalidation: "官方季节展望下调强度，区域异常持续弱于预报。",
      },
    ],
    transitTrend: null,
  },
  {
    id: "hormuz",
    eventId: "EVENT-2026-07-23-03",
    region: "中东 · 航运",
    title: "霍尔木兹海峡通行仍未恢复常态",
    state: `PortWatch · ${hormuzMonth}月${hormuzDay}日快照`,
    signal: "知识库解释 · 结构类比",
    classicalConcept: "聚货、交易与流通",
    classicalQuote: "故待农而食之，虞而出之，工而成之，商而通之。",
    classicalSource: {
      title: "《史记·货殖列传》· 序言",
      href: "https://zh.wikisource.org/w/index.php?title=史記/卷129&oldid=7904128",
    },
    modernBridge:
      "古今共享的结构是“通”：物资价值不仅来自生产，也依赖节点、路径与交换。关键节点受阻时，后果可能超出节点本身。",
    interpretationLimits: [
      "古代分工描述不包含现代港口、船型、保险、制裁和能源市场机制。",
      "“商而通之”不能证明任何现代自由贸易立场，也不能预测油价或运价。",
      "当前是否恢复通行必须由船舶、港口、承运人和官方航行信息判断。",
    ],
    observationWindow: "未来十五个自然日；每日用新增数据验证",
    interpretationSupport: "每日过境船舶增加、等待与改道减少、战争险费率回落",
    interpretationWeakening: "通行再次中断、改道扩大或保险与运费持续上升",
    forecast: {
      status: "观察中",
      statusType: "watching",
      validUntil: "2026 年 8 月 6 日",
      readiness: "结算条件完整",
      note: `基于截至 ${hormuzMonth} 月 ${hormuzDay} 日的过去30日数据，当前更支持“断续低位延续”；每日新数据只验证或发布新版本，不改写原始推演。`,
    },
    summary:
      `过去30日总过境数中位数为 ${hormuzBaselineMedian} 艘；最近7日中位数较最早7日下降 ${Math.abs(hormuzBaseline30.first_to_last_7d_change_pct)}%，未来15日更可能维持断续低位。`,
    facts: [
      "UNCTAD称，超过100天的通行中断已形成可能延续至重新开放后的经济后效应。",
      `IMF PortWatch显示，过去30日总过境数中位数为${hormuzBaselineMedian}艘，战前一年中位数为${hormuzPreCrisisMedian}艘。`,
      `过去30日最早7日中位数为${hormuzBaseline30.first_7d_median}艘，最近7日降至${hormuzBaseline30.last_7d_median}艘。`,
      `最新日总过境数为${hormuzLatest.total_transits}艘，其中货船${hormuzLatest.cargo_total}艘、油轮${hormuzLatest.tanker}艘。`,
    ],
    unknowns: [
      "关闭AIS或信号漏收造成的低估规模",
      "通行限制的具体执行方式",
      "战争险、运费与改道规模的当日变化",
    ],
    signals: ["PortWatch每日过境数与船型构成", "UKMTO安全事件", "NAVAREA IX航行警告"],
    sources: [
      {
        label: "IMF PortWatch · 霍尔木兹逐日过境数据",
        href: "https://data-download.imf.org/climatedata/portwatch-chokepoints-indicators.html?portid=chokepoint6",
      },
      {
        label: "UKMTO · 海事安全通报",
        href: "https://www.ukmto.org/ukmto-products",
      },
      {
        label: "UNCTAD · 霍尔木兹中断后效应",
        href: "https://unctad.org/news/hormuz-reopening-may-calm-markets-vulnerable-economies-face-lasting-consequences",
      },
    ],
    scenarios: [
      {
        name: "未来15日出现持续修复",
        trigger: "7月23日至8月6日至少取得12个有效日；窗口中位数达到22艘，且至少9日高于发布时30日中位数18.5艘。",
        invalidation: "窗口中位数不高于18.5艘，或至少5日降至9艘及以下。",
      },
      {
        name: "未来15日延续断续低位",
        trigger: "至少取得12个有效日，且窗口中位数不高于18.5艘；或至少5日降至9艘及以下并出现新的官方安全事件。",
        invalidation: "窗口中位数达到22艘，且至少9日高于18.5艘。",
      },
    ],
    transitTrend: {
      asOf: hormuzAsOf,
      status: hormuzTrendStatus,
      latest: hormuzLatest.total_transits,
      baselineMedian: hormuzBaselineMedian,
      preCrisisMedian: hormuzPreCrisisMedian,
      normality: hormuzNormality,
      trendChange: hormuzBaseline30.first_to_last_7d_change_pct,
      observedLagDays: hormuzSnapshot.observed_lag_days,
      chartMax: hormuzChartMax,
      days: hormuzHistoryDays,
      stageFeedback: [
        hormuzValidation.stage_feedback.facts,
        hormuzValidation.stage_feedback.structure,
        hormuzValidation.stage_feedback.forecast,
        hormuzValidation.stage_feedback.validation,
      ],
      validationProgress: hormuzValidation.progress,
      latestComposition: [
        {
          label: "货船",
          value: hormuzLatest.cargo_total,
          share: (hormuzLatest.cargo_total / hormuzLatest.total_transits) * 100,
        },
        {
          label: "油轮",
          value: hormuzLatest.tanker,
          share: (hormuzLatest.tanker / hormuzLatest.total_transits) * 100,
        },
      ],
    },
  },
];

const eventPools = [
  { name: "天地之变", scope: "气候与自然环境" },
  { name: "生民之变", scope: "疫情与公共健康" },
  { name: "天下之变", scope: "政治与社会秩序" },
  { name: "流通之变", scope: "贸易、能源与科技" },
];

export default function Home() {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [activeEvent, setActiveEvent] = useState(events[0]);
  const [inputMode, setInputMode] = useState<"文字" | "链接" | "截图">("文字");
  const activeForecast = forecastsByEventId[activeEvent.eventId];
  const activeValidation = validationsByForecastId[activeForecast.forecast_id];
  const activeDailyReview = dailyReviewsByEventId[activeEvent.eventId];
  const activePassages = activeForecast.reasoning_basis.knowledge_passage_ids.map(
    (passageId) => passagesById[passageId],
  );

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
            每天五分钟，跟踪三件正在改变世界的事：
            先看事实，再读古典解释，最后查看未来十五天走向与后续验证。
          </p>
          <div className="hero-actions">
            <a href="#events">查看今日三件事 <span>↓</span></a>
            <small>固定日期样本 · 每项判断均可回看</small>
          </div>
        </div>

        <CelestialChart />

        <div className="celestial-strip">
          <div>
            <small>时间坐标</small>
            <strong>2026-07-23 · 08:00 CST</strong>
          </div>
          <div>
            <small>月相</small>
            <strong>盈凸月 · 照明 64.9%</strong>
          </div>
          <div>
            <small>星盘坐标</small>
            <strong>赤道 J2000 · 北天极居中</strong>
          </div>
          <div className="truth-label">
            <small>数据状态</small>
            <strong>七曜已实算 · 距星工作映射</strong>
          </div>
        </div>
      </section>

      <section className="world-section" id="events">
        <div className="section-heading">
          <div>
            <span>02 / 今日三件事</span>
            <h2>今天，世界的三件重要变化</h2>
          </div>
          <p>
            每件事都分成现实事实、古典解释、未来情景与后续验证。
            当前为 2026 年 7 月 23 日固定样本。
          </p>
        </div>

        <section className="daily-review-summary" aria-label="今日复盘结果">
          <div>
            <small>今日复盘 · {dailyReviewDate}</small>
            <strong>
              {dailyReview.reviews.length} 项已检查，暂无发布后新增正式证据
            </strong>
          </div>
          <p>
            三项原始推演均保留；“没有新证据”不记为结论获得支持。
          </p>
          <span>{dailyReviewAwaitingCount} 项等待下一次正式来源更新</span>
        </section>

        <div className="event-pools" aria-label="事件领域">
          {eventPools.map((pool, index) => (
            <div key={pool.name}>
              <span>0{index + 1}</span>
              <strong>{pool.name}</strong>
              <small>{pool.scope}</small>
            </div>
          ))}
        </div>

        <ImpactGraph />

        <div className="world-grid">
          <div className="earth-panel">
            <div className="earth-panel-heading">
              <small>真实地球观测</small>
              <strong>全球环境快照</strong>
              <span>2026 / 07 / 23</span>
            </div>
            <div
              className="earth"
              aria-label={`${weatherSnapshot.title}，影像日期 ${weatherSnapshot.valid_time}`}
              style={{ backgroundImage: `url(${weatherSnapshot.image.public_path})` }}
            >
              <div className="earth-grid" />
              <button
                className={`earth-marker marker-a ${activeEvent.id === events[0].id ? "active" : ""}`}
                aria-label={`查看事件 01：${events[0].title}`}
                aria-pressed={activeEvent.id === events[0].id}
                onClick={() => setActiveEvent(events[0])}
              >
                01
              </button>
              <button
                className={`earth-marker marker-b ${activeEvent.id === events[1].id ? "active" : ""}`}
                aria-label={`查看事件 02：${events[1].title}`}
                aria-pressed={activeEvent.id === events[1].id}
                onClick={() => setActiveEvent(events[1])}
              >
                02
              </button>
              <button
                className={`earth-marker marker-c ${activeEvent.id === events[2].id ? "active" : ""}`}
                aria-label={`查看事件 03：${events[2].title}`}
                aria-pressed={activeEvent.id === events[2].id}
                onClick={() => setActiveEvent(events[2])}
              >
                03
              </button>
            </div>
            <div className="earth-caption">
              <span>NOAA-20 · {weatherValidDate}</span>
              <strong>{weatherSnapshot.interpretation.display_name}</strong>
              <p>
                NOAA-20 / VIIRS · 每日观测合成 · 原始图层 {weatherSnapshot.spatial_resolution.native_layer}
              </p>
              <p>{weatherSnapshot.interpretation.direct_event_impact}</p>
              <a
                href={weatherSnapshot.source.documentation_url}
                target="_blank"
                rel="noreferrer"
              >
                NASA GIBS 来源与方法
              </a>
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

        <article className="analysis-card" aria-live="polite">
          <header className="analysis-title">
            <div>
              <span>当前观察焦点</span>
              <h3>{activeEvent.title}</h3>
            </div>
            <p>{activeEvent.state} · 资料截止 07 月 23 日 08:00</p>
          </header>

          <section className="direction-conclusion" aria-labelledby="direction-conclusion-title">
            <div className="direction-verdict">
              <small>墨观推演结论</small>
              <h4 id="direction-conclusion-title">{activeForecast.current_direction.headline}</h4>
              <p>{activeForecast.current_direction.current_judgment}</p>
            </div>
            <div className="direction-outlook">
              <small>未来走向</small>
              <strong>{activeForecast.current_direction.outlook}</strong>
            </div>
            <div className="direction-window">
              <div>
                <small>适用时间</small>
                <strong>截至 {activeEvent.forecast.validUntil}</strong>
              </div>
              <div>
                <small>改判条件</small>
                <p>{activeForecast.current_direction.change_condition}</p>
              </div>
            </div>
          </section>

          <section className="latest-verification" aria-labelledby="latest-verification-title">
            <header>
              <div>
                <small>最新验证</small>
                <h4 id="latest-verification-title">原结论是否仍然成立</h4>
              </div>
              <span className={activeValidation.decision_feedback.status}>
                {activeValidation.decision_feedback.label}
              </span>
            </header>
            <div className="verification-grid">
              <div>
                <small>原始推演</small>
                <strong>{activeValidation.decision_feedback.original_headline}</strong>
                <em>已冻结，不回写</em>
              </div>
              <div>
                <small>新增事实反馈</small>
                <p>{activeValidation.decision_feedback.latest_change}</p>
              </div>
              <div>
                <small>当前结论</small>
                <strong>{activeValidation.decision_feedback.current_headline}</strong>
                <em>
                  {activeValidation.decision_feedback.conclusion_action === "maintain_original"
                    ? "维持原判断"
                    : "发布新版本"}
                </em>
              </div>
            </div>
            <footer>
              <span>
                来源最新日期：{activeValidation.decision_feedback.source_latest_available_date}
              </span>
              <span>{activeValidation.decision_feedback.source_cadence}</span>
            </footer>
          </section>

          <section className="review-timeline" aria-labelledby="review-timeline-title">
            <header>
              <div>
                <small>持续观察记录</small>
                <h4 id="review-timeline-title">推演与复盘时间轴</h4>
              </div>
              <span>
                {activeValidation.settlement_state === "watching" ? "尚未结算" : "已结算"}
              </span>
            </header>
            <ol>
              <li className="sealed">
                <time>{activeForecast.issued_at.slice(0, 10)}</time>
                <div>
                  <small>原始推演</small>
                  <strong>推演结论已封存</strong>
                  <p>{activeDailyReview.original_conclusion.label}</p>
                </div>
                <em>不可回写</em>
              </li>
              <li className="reviewed">
                <time>{dailyReview.review_date}</time>
                <div>
                  <small>每日复盘</small>
                  <strong>本次来源复核已完成</strong>
                  <p>{activeDailyReview.current_feedback.latest_change}</p>
                </div>
                <em>{activeDailyReview.current_feedback.label}</em>
              </li>
              <li className="pending">
                <time>下一次正式更新</time>
                <div>
                  <small>继续验证</small>
                  <strong>等待新事实进入账本</strong>
                  <p>{activeDailyReview.next_action}</p>
                </div>
                <em>观察中</em>
              </li>
            </ol>
            <footer>
              <span>新增正式证据：0 项</span>
              <span>当前动作：维持原推演，等待验证</span>
            </footer>
          </section>

          <div className="fact-grid">
            <section>
              <small>已确认事实</small>
              <ul>
                {activeEvent.facts.map((fact) => <li key={fact}>{fact}</li>)}
              </ul>
            </section>
            <section>
              <small>仍然未知</small>
              <ul>
                {activeEvent.unknowns.map((unknown) => <li key={unknown}>{unknown}</li>)}
              </ul>
            </section>
            <section>
              <small>下一步观测</small>
              <div className="signal-list">
                {activeEvent.signals.map((signal) => <span key={signal}>{signal}</span>)}
              </div>
            </section>
          </div>

          {activeEvent.transitTrend && (
            <section className="transit-monitor" aria-labelledby="transit-monitor-title">
              <header>
                <div>
                  <small>日度通行反馈 · IMF PortWatch</small>
                  <h4 id="transit-monitor-title">霍尔木兹贸易脉搏</h4>
                </div>
                <div className="transit-asof">
                  <span>{activeEvent.transitTrend.status}</span>
                  <small>数据截至 {activeEvent.transitTrend.asOf}</small>
                </div>
              </header>

              <div className="transit-metrics">
                <div>
                  <small>最新日过境</small>
                  <strong>{activeEvent.transitTrend.latest}<em>艘</em></strong>
                </div>
                <div>
                  <small>过去30日中位数</small>
                  <strong>{activeEvent.transitTrend.baselineMedian}<em>艘</em></strong>
                </div>
                <div>
                  <small>最早7日 → 最近7日</small>
                  <strong>{activeEvent.transitTrend.trendChange}<em>%</em></strong>
                </div>
                <div className="normality-metric">
                  <small>30日基线／战前常态</small>
                  <strong>{activeEvent.transitTrend.normality}<em>%</em></strong>
                </div>
              </div>

              <div className="stage-feedback" aria-label="墨观阶段性反馈">
                {activeEvent.transitTrend.stageFeedback.map((feedback) => (
                  <article key={feedback.label}>
                    <header>
                      <small>{feedback.label}</small>
                      <span>依据可追溯</span>
                    </header>
                    <strong>{feedback.status}</strong>
                    <p>{feedback.statement}</p>
                    <em>依据：{feedback.basis}</em>
                    {"boundary" in feedback && feedback.boundary && (
                      <em>{feedback.boundary}</em>
                    )}
                    {"progress" in feedback && feedback.progress && (
                      <em>{feedback.progress}</em>
                    )}
                  </article>
                ))}
              </div>

              <div className="transit-detail">
                <div className="transit-chart">
                  <div className="chart-heading">
                    <span>过去30日总过境数</span>
                    <small>
                      虚线为30日中位数 {activeEvent.transitTrend.baselineMedian} 艘
                    </small>
                  </div>
                  <div className="bar-field">
                    <div
                      className="median-line"
                      aria-hidden="true"
                      style={{
                        bottom:
                          `${(activeEvent.transitTrend.baselineMedian /
                            activeEvent.transitTrend.chartMax) * 120}px`,
                      }}
                    >
                      <span>{activeEvent.transitTrend.baselineMedian}</span>
                    </div>
                    {activeEvent.transitTrend.days.map((day) => (
                      <div
                        className="transit-day"
                        key={day.date}
                        aria-label={`${day.date}，总过境 ${day.total} 艘`}
                      >
                        <span className="day-value">{day.total}</span>
                        <i
                          style={{
                            height:
                              `${(day.total / activeEvent.transitTrend.chartMax) * 120}px`,
                          }}
                        />
                        {day.showDate && <small>{day.date}</small>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="transit-context">
                  <div>
                    <span>距离战前常态</span>
                    <strong>{activeEvent.transitTrend.normality}%</strong>
                    <div
                      className="normality-track"
                      aria-label={`当前为战前常态的 ${activeEvent.transitTrend.normality}%`}
                    >
                      <i style={{ width: `${activeEvent.transitTrend.normality}%` }} />
                    </div>
                    <p>近期虽有回升，但仍不能称为恢复正常。</p>
                  </div>
                  <div>
                    <span>最新日船型构成</span>
                    <div className="composition-track" aria-label="最新日货船 11 艘，油轮 4 艘">
                      {activeEvent.transitTrend.latestComposition.map((item) => (
                        <i
                          className={item.label === "货船" ? "cargo" : "tanker"}
                          key={item.label}
                          style={{ width: `${item.share}%` }}
                        />
                      ))}
                    </div>
                    <div className="composition-legend">
                      {activeEvent.transitTrend.latestComposition.map((item) => (
                        <span key={item.label}>
                          <i className={item.label === "货船" ? "cargo" : "tanker"} />
                          {item.label} {item.value} 艘
                        </span>
                      ))}
                    </div>
                    <p>
                      聚合数据当前约滞后 {activeEvent.transitTrend.observedLagDays} 日，
                      且可能因 AIS 覆盖修订。
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="interpretation-card">
            <header>
              <div>
                <small>墨观解释</small>
                <strong>{activeEvent.classicalConcept}</strong>
              </div>
              <span>{activeEvent.signal}</span>
            </header>
            <div className="interpretation-grid">
              <section className="classical-reading">
                <small>01 · 古典之言</small>
                <blockquote>“{activeEvent.classicalQuote}”</blockquote>
                <a
                  className="classical-source"
                  href={activeEvent.classicalSource.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {activeEvent.classicalSource.title}<span>↗</span>
                </a>
              </section>
              <section>
                <small>02 · 古今之桥</small>
                <p>{activeEvent.modernBridge}</p>
              </section>
              <section>
                <small>03 · 边界与异说</small>
                <ul>
                  {activeEvent.interpretationLimits.map((limit) => <li key={limit}>{limit}</li>)}
                </ul>
              </section>
              <section>
                <small>04 · 继续观察</small>
                <b>{activeEvent.observationWindow}</b>
                <p><em>支持：</em>{activeEvent.interpretationSupport}</p>
                <p><em>削弱：</em>{activeEvent.interpretationWeakening}</p>
              </section>
            </div>
          </section>

          <div className="analysis-columns">
            <section>
              <small>事实来源</small>
              <strong>可回到原始证据</strong>
              <div className="source-links">
                {activeEvent.sources.map((source) => (
                  <a key={source.href} href={source.href} target="_blank" rel="noreferrer">
                    {source.label}<span>↗</span>
                  </a>
                ))}
              </div>
            </section>
            <section>
              <small>情景推演</small>
              <div className="forecast-heading">
                <strong>两种可检验路径</strong>
                <span className={activeEvent.forecast.statusType}>{activeEvent.forecast.status}</span>
              </div>
              <div className="forecast-meta">
                <div><small>观察截止</small><b>{activeEvent.forecast.validUntil}</b></div>
                <div><small>推演账本</small><b>{activeForecast.forecast_id}</b></div>
                <div><small>结算准备度</small><b>{activeEvent.forecast.readiness}</b></div>
              </div>
              <p className={`forecast-note ${activeEvent.forecast.statusType}`}>
                {activeEvent.forecast.note}
              </p>
              <div className="reasoning-chain" aria-label="推演依据链">
                <article>
                  <span>01</span>
                  <div>
                    <small>现代事实来源</small>
                    <strong>{activeForecast.reasoning_basis.modern_source_ids.length} 条冻结记录</strong>
                    <div className="reasoning-ids">
                      {activeForecast.reasoning_basis.modern_source_ids.map((sourceId) => (
                        <code key={sourceId}>{sourceId}</code>
                      ))}
                    </div>
                  </div>
                </article>
                <article>
                  <span>02</span>
                  <div>
                    <small>知识库分析</small>
                    <strong>{activeForecast.reasoning_basis.knowledge_analysis_id}</strong>
                  </div>
                </article>
                <article>
                  <span>03</span>
                  <div>
                    <small>古籍段落</small>
                    <strong>
                      {activePassages.map((passage) => {
                        const work = worksById[passage.work_id];
                        return `${work.canonical_title} · ${passage.chapter}`;
                      }).join("；")}
                    </strong>
                    <div className="reasoning-ids">
                      {activeForecast.reasoning_basis.knowledge_passage_ids.map((passageId) => (
                        <code key={passageId}>{passageId}</code>
                      ))}
                    </div>
                  </div>
                </article>
                <article>
                  <span>04</span>
                  <div>
                    <small>推演路径</small>
                    <p>{activeForecast.reasoning_basis.method}</p>
                  </div>
                </article>
                <article>
                  <span>05</span>
                  <div>
                    <small>责任边界</small>
                    <p>{activeForecast.reasoning_basis.boundary}</p>
                  </div>
                </article>
              </div>
              <div className="scenario-list">
                {activeEvent.scenarios.map((scenario) => (
                  <div key={scenario.name}>
                    <b>{scenario.name}</b>
                    <p><em>触发：</em>{scenario.trigger}</p>
                    <p><em>失效：</em>{scenario.invalidation}</p>
                  </div>
                ))}
              </div>
            </section>
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
