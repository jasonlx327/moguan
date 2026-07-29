import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Moguan P0 shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>墨观｜今日天地<\/title>/);
  assert.match(html, /今日天地/);
  assert.match(html, /仰观天象，俯察人事/);
  assert.match(html, /每天五分钟，跟踪三件正在改变世界的事/);
  assert.match(html, /查看今日三件事/);
  assert.match(html, /事件研判/);
  assert.match(html, /当日真实星空/);
  assert.match(html, /二十八宿与七曜/);
  assert.match(html, /传统星盘/);
  assert.match(html, /夜晚实景/);
  assert.match(html, /盈凸月 · 照明 64.9%/);
  assert.match(html, /七曜已实算 · 距星工作映射/);
  assert.doesNotMatch(html, /星历位置尚未接入|样式占位/);
  assert.match(html, /卫星云况（真彩色观测）/);
  assert.match(html, /全球环境快照/);
  assert.match(html, /NOAA-20 \/ VIIRS/);
  assert.match(html, /2026 \/ 07 \/ 23/);
  assert.match(html, /NASA GIBS 来源与方法/);
  assert.match(html, /未发现可仅凭本图直接归因/);
  assert.match(html, /viirs-noaa20-truecolor\.2026-07-23\.jpg/);
  assert.match(html, /事势星云/);
  assert.match(html, /商务部第30号公告/);
  assert.match(html, /来源主张与现实结果分层/);
  assert.match(html, /实线 · 已有来源支持/);
  assert.match(html, /灰线 · 相关不等于因果/);
  assert.match(html, /虚线 · 等待现实验证/);
  assert.match(html, /商务部将14家欧盟实体列入出口管制管控名单/);
  assert.match(html, /欧盟第21轮对俄制裁/);
  assert.match(html, /VIGO许可申请与实际交付结果/);
  assert.match(html, /候验 · 阶段反馈/);
  assert.match(html, /回应关系已经确认/);
  assert.match(html, /局部受限，总体影响受控/);
  assert.match(html, /尚不能外推至全部实体/);
  assert.match(html, /事实版本 2026-07-29-v0.2/);
  assert.match(html, /知典 · 已审/);
  assert.match(html, /流通条件、禁限与后续应变/);
  assert.match(html, /古籍解释已公开 · 尚未进入未来推演/);
  assert.match(html, /故待农而食之，虞而出之，工而成之，商而通之/);
  assert.match(html, /库存和替代供应可缓冲红外业务/);
  assert.match(html, /古今之桥/);
  assert.match(html, /这一政治因由不能直接证明任何企业已经发生经济损失/);
  assert.doesNotMatch(html, /一闔一闢謂之變|日中为市，致天下之民/);
  assert.doesNotMatch(html, /事件评分|筛选得分|总分 76/);
  assert.match(html, /3(?:<!-- -->)? 项已检查，暂无发布后新增正式证据/);
  assert.doesNotMatch(html, /全球天气视觉占位|当前为视觉占位/);
  assert.match(html, /知识库解释 · 结构类比/);
  assert.match(html, /民疾疫者，舍空邸第，为置医药/);
  assert.match(html, /古今之桥/);
  assert.match(html, /边界与异说/);
  assert.match(html, /继续观察/);
  assert.match(html, /墨观推演结论/);
  assert.match(html, /疫情压力仍向外扩张/);
  assert.match(html, /未来走向/);
  assert.match(html, /适用时间/);
  assert.match(html, /改判条件/);
  assert.match(html, /最新验证/);
  assert.match(html, /原结论是否仍然成立/);
  assert.match(html, /尚无新证据/);
  assert.match(html, /已冻结，不回写/);
  assert.match(html, /维持原判断/);
  assert.match(html, /推演与复盘时间轴/);
  assert.match(html, /推演结论已封存/);
  assert.match(html, /本次来源复核已完成/);
  assert.match(html, /等待新事实进入账本/);
  assert.match(html, /新增正式证据：0 项/);
  assert.match(html, /观察截止/);
  assert.match(html, /推演账本/);
  assert.match(html, /现代事实来源/);
  assert.match(html, /知识库分析/);
  assert.match(html, /古籍段落/);
  assert.match(html, /推演路径/);
  assert.match(html, /责任边界/);
  assert.match(html, /FORECAST-2026-07-23-01/);
  assert.match(html, /SRC-20260723-WHO-EBOLA/);
  assert.match(html, /ANALYSIS-2026-07-23-01/);
  assert.match(html, /PASS-HANSHU-PINGDIJI-0001/);
  assert.doesNotMatch(html, /预测置信度/);
  assert.match(html, /结算条件完整/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/);
});
