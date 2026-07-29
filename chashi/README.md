# 察势：事势星云

本目录保存事件关系图的数据契约与实际快照。事势星云不是自动生成的因果图：

- `fact` 只表示来源能够直接支持的关系；
- `correlation` 表示相关或时间邻近，不声明因果；
- `inference` 表示等待现实验证的传导方向；
- 古籍类比和墨观推演必须使用独立图层，不能混入现代事实层。

每条关系必须能够回到事件账本中的来源和主张。草稿关系不会因为显示在图上而自动成为事实。

## 校验

```bash
node scripts/validate-impact-graph.mjs \
  chashi/graphs/EVENT-2026-07-29-01.json \
  event-ledger/daily/2026-07-29.json
```
