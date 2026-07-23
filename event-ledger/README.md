# 墨观每日候选事件账本

**版本：v0.1｜状态：工作流骨架可用，2026-07-23 尚未采集**

本目录保存“发现线索—合并事件—核验主张—统一评分—人工选择—发布”全过程。它不保存新闻全文，也不把古典理论用于选题评分。

## 目录

- `registries/discovery-sources.v0.1.json`：发现源及使用边界；
- `schemas/daily-ledger.schema.v0.1.json`：字段与枚举契约；
- `templates/daily-ledger.template.json`：新建每日账本的空模板；
- `daily/`：按日期保存的实际账本。

## 两种校验

```bash
npm run events:validate
npm run events:validate:publish
```

草稿校验检查结构、引用和评分计算，允许候选尚未收集完。发布校验额外要求：

1. 至少 10 个候选事件；
2. 所有候选均有明确处理决定；
3. 恰好 3 个事件入选；
4. 每个入选事件至少有两条独立证据链；
5. 每条确认主张有支持来源；
6. 入选事件完成人工审核；
7. 发布版本、审核人和审核时间齐全。

## 内容边界

- Bloomberg、华尔街日报和联合国官网首先是发现源；
- 文章标题只生成线索，不直接生成事实结论；
- 同一公告被多家媒体转述，只算一条证据链；
- 只保存来源名、标题或人工概括、时间、链接和核验用途；
- 不保存付费新闻正文，不绕过付费墙，不对受限网页做自动抓取；
- `classical_fit`、星象契合度、社交热度等字段禁止进入评分对象。

每个候选事件仍须遵守 P0 统一数据外壳，单独保存 `record_type`、`observed_at`、`collected_at`、`cutoff_at`、`timezone`、`data_status`、`confidence`、`review_status` 和 `version`。不能只依赖账本顶层字段隐式继承。
