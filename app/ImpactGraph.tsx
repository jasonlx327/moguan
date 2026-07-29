"use client";

import { useEffect, useRef, useState } from "react";
import impactGraph from "../chashi/graphs/EVENT-2026-07-29-01.json";
import eventLedger from "../event-ledger/daily/2026-07-29.json";
import eventMappings from "../knowledge-base/registries/event-mappings.2026-07-29.v0.1.json";

type GraphNode = (typeof impactGraph.nodes)[number];
type GraphEdge = (typeof impactGraph.edges)[number] & {
  boundary_note?: string;
};

const nodePositions: Record<string, { x: number; y: number }> = {
  "NODE-MOFCOM-30-EVENT": { x: 50, y: 47 },
  "NODE-MOFCOM": { x: 50, y: 12 },
  "NODE-EU-14-ENTITIES": { x: 78, y: 29 },
  "NODE-CN-DUAL-USE-FLOW": { x: 79, y: 58 },
  "NODE-MOFCOM-LICENSE": { x: 70, y: 84 },
  "NODE-EU-21-PACKAGE": { x: 22, y: 25 },
  "NODE-EU-CHINA-LISTINGS": { x: 17, y: 61 },
  "NODE-EU-RESPONSE": { x: 33, y: 85 },
  "NODE-DELIVERY-CHANGE": { x: 51, y: 88 },
  "NODE-COMPANY-DISCLOSURE": { x: 88, y: 84 },
};

const ringLabels: Record<GraphNode["ring"], string> = {
  center: "中心事件",
  direct: "直接事实",
  context: "背景事件",
  watch: "后续观察",
};

const relationLabels: Record<GraphEdge["relation_type"], string> = {
  constrains: "约束",
  depends_on: "取决于",
  precedes: "时间先于",
  correlates_with: "主题相关",
  may_lead_to: "可能传导",
};

const sourcesById = Object.fromEntries(
  eventLedger.source_records.map((source) => [source.source_record_id, source]),
) as Record<string, (typeof eventLedger.source_records)[number]>;
const researchMapping = eventMappings.event_mappings[0];

export default function ImpactGraph() {
  const graphScrollRef = useRef<HTMLDivElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState(
    "NODE-MOFCOM-30-EVENT",
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const selectedNode = impactGraph.nodes.find(
    (node) => node.node_id === selectedNodeId,
  );
  const selectedEdge = impactGraph.edges.find(
    (edge) => edge.edge_id === selectedEdgeId,
  ) as GraphEdge | undefined;
  const selectedSourceIds = selectedEdge
    ? selectedEdge.source_record_ids
    : selectedNode?.source_record_ids ?? [];

  useEffect(() => {
    const container = graphScrollRef.current;
    if (!container || container.scrollWidth <= container.clientWidth) return;
    container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
  }, []);

  function selectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
  }

  function selectEdge(edgeId: string) {
    setSelectedEdgeId(edgeId);
  }

  return (
    <section className="impact-graph-section" aria-labelledby="impact-graph-title">
      <header>
        <div>
          <span>察势 · 新事件样本</span>
          <h3 id="impact-graph-title">事势星云</h3>
        </div>
        <div className="impact-graph-meta">
          <strong>商务部第30号公告</strong>
          <small>资料截止 2026 / 07 / 29 · 事实网络，不作因果预设</small>
        </div>
      </header>

      <div className="impact-graph-intro">
        <p>
          以一项已核验事件为中心，向外展开直接事实、同期背景与需要继续观察的变化。
          点击节点或连线，查看它为何被放在这里。
        </p>
        <div className="impact-graph-legend" aria-label="关系图例">
          <span><i className="fact" />实线 · 已有来源支持</span>
          <span><i className="correlation" />灰线 · 相关不等于因果</span>
          <span><i className="inference" />虚线 · 等待现实验证</span>
        </div>
        <span className="impact-scroll-hint">左右滑动查看全图</span>
      </div>

      <div className="impact-graph-layout">
        <div className="impact-graph-scroll" ref={graphScrollRef}>
          <div className="impact-graph-canvas" aria-label={impactGraph.title}>
            <div className="impact-ring impact-ring-direct" aria-hidden="true" />
            <div className="impact-ring impact-ring-context" aria-hidden="true" />
            <div className="impact-ring impact-ring-watch" aria-hidden="true" />
            <svg viewBox="0 0 1000 600" aria-label="事件关系连线">
              <defs>
                <marker
                  id="impact-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              </defs>
              {impactGraph.edges.map((edge) => {
                const from = nodePositions[edge.from];
                const to = nodePositions[edge.to];
                const fromNode = impactGraph.nodes.find(
                  (node) => node.node_id === edge.from,
                );
                const toNode = impactGraph.nodes.find(
                  (node) => node.node_id === edge.to,
                );
                const edgeClass = `${edge.evidence_class} ${
                  selectedEdgeId === edge.edge_id ? "selected" : ""
                }`;
                const x1 = from.x * 10;
                const y1 = from.y * 6;
                const x2 = to.x * 10;
                const y2 = to.y * 6;
                const path =
                  edge.evidence_class === "correlation"
                    ? `M ${x1} ${y1} Q ${(x1 + x2) / 2 - 55} ${
                        (y1 + y2) / 2 + 55
                      } ${x2} ${y2}`
                    : `M ${x1} ${y1} L ${x2} ${y2}`;
                return (
                  <g key={edge.edge_id}>
                    <path
                      className={`impact-edge ${edgeClass}`}
                      d={path}
                      fill="none"
                      markerEnd="url(#impact-arrow)"
                    />
                    <path
                      className="impact-edge-hit"
                      d={path}
                      fill="none"
                      role="button"
                      tabIndex={0}
                      aria-label={`${fromNode?.label}至${toNode?.label}：${
                        relationLabels[edge.relation_type]
                      }`}
                      onClick={() => selectEdge(edge.edge_id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          selectEdge(edge.edge_id);
                        }
                      }}
                    />
                  </g>
                );
              })}
            </svg>

            {impactGraph.nodes.map((node) => {
              const position = nodePositions[node.node_id];
              return (
                <button
                  key={node.node_id}
                  className={`impact-node ${node.ring} ${
                    selectedNode?.node_id === node.node_id && !selectedEdge
                      ? "selected"
                      : ""
                  }`}
                  style={{ left: `${position.x}%`, top: `${position.y}%` }}
                  aria-pressed={
                    selectedNode?.node_id === node.node_id && !selectedEdge
                  }
                  onClick={() => selectNode(node.node_id)}
                >
                  <small>{ringLabels[node.ring]}</small>
                  <strong>{node.label}</strong>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="impact-detail" aria-live="polite">
          {selectedEdge ? (
            <>
              <span>关系说明</span>
              <h4>{relationLabels[selectedEdge.relation_type]}</h4>
              <p>
                {impactGraph.nodes.find((node) => node.node_id === selectedEdge.from)?.label}
                <b> → </b>
                {impactGraph.nodes.find((node) => node.node_id === selectedEdge.to)?.label}
              </p>
              <dl>
                <div>
                  <dt>当前性质</dt>
                  <dd>
                    {selectedEdge.evidence_class === "fact"
                      ? "已有来源支持的事实关系"
                      : selectedEdge.evidence_class === "correlation"
                        ? "仅确认时间或主题相关"
                        : "后续观察方向"}
                  </dd>
                </div>
                <div>
                  <dt>边界</dt>
                  <dd>
                    {selectedEdge.boundary_note ??
                      "该关系只表达来源已确认的约束、依赖或时间先后。"}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <span>{selectedNode ? ringLabels[selectedNode.ring] : "节点说明"}</span>
              <h4>{selectedNode?.label}</h4>
              <p>
                {selectedNode?.state === "confirmed"
                  ? "该节点已经进入事实账本。点击相连线条可查看关系性质。"
                  : "该节点尚未成为事实，只表示接下来要观察什么。"}
              </p>
            </>
          )}

          <div className="impact-sources">
            <small>{selectedSourceIds.length > 0 ? "相关来源" : "当前状态"}</small>
            {selectedSourceIds.length > 0 ? (
              selectedSourceIds.map((sourceId) => {
                const source = sourcesById[sourceId];
                return (
                  <a
                    key={sourceId}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.title_or_paraphrase}<i>↗</i>
                  </a>
                );
              })
            ) : (
              <p>等待官方回应、企业披露或可核验的交付与许可变化。</p>
            )}
          </div>
        </aside>
      </div>

      <section className="impact-classics-gate" aria-labelledby="impact-classics-title">
        <header>
          <div>
            <span>知典 · 待审</span>
            <h4 id="impact-classics-title">{researchMapping.theme}</h4>
          </div>
          <strong>尚未进入古籍公开解释</strong>
        </header>
        <div>
          <article>
            <small>候选角度</small>
            <p>{researchMapping.interpretive_frame}</p>
          </article>
          <article>
            <small>当前进度</small>
            <p>
              已命中 {researchMapping.passage_ids.length} 条候选古籍；仍须完成事件入选、
              引文复核与现实影响证据补充。
            </p>
          </article>
          <article>
            <small>五行边界</small>
            <p>{researchMapping.five_phase_position}</p>
          </article>
        </div>
      </section>
    </section>
  );
}
