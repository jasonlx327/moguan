# EU Cellar 公开文档发现链

本目录保存墨观从欧盟出版局 Cellar 知识图谱获得的公开文档候选快照。

## 边界

- Cellar SPARQL 是官方元数据发现接口，不等于墨观已经确认事件。
- 标题关键词命中只生成 `discovery_candidate`。
- CELEX、ELI 或 Cellar 标识用于回到官方原文复核。
- 复核时必须区分已经生效的法规、提案、委员会报告、公告和汇编。
- 未完成人工复核的记录不得进入事件账本，也不得直接参与古籍解释或走向推演。

## 当前查询

- 时间窗：默认截至采集日的连续 30 个自然日（含首尾）。
- 语言：英文表达层 `ENG`。
- 主题词：`semiconductor`、`export control`、`advanced computing`、`dual-use`。
- 上限：100 条；接口返回超过上限时任务失败，避免静默截断。

## 使用

```bash
npm run eu-cellar:fetch
npm run eu-cellar:validate
```

指定日期：

```bash
node scripts/fetch-eu-cellar.mjs \
  --from 2026-06-29 \
  --to 2026-07-28 \
  --output guanxiang/eu-cellar/current.json
```

## 官方入口

- SPARQL：<https://publications.europa.eu/webapi/rdf/sparql>
- Cellar 知识图谱说明：<https://op.europa.eu/en/web/cellar/cellar-data/metadata/knowledge-graph>
- EUR-Lex 数据复用说明：<https://eur-lex.europa.eu/content/help/data-reuse/reuse-contents-eurlex-details.html?locale=en>
