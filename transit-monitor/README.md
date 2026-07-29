# 墨观关键航道日度监测

本目录保存按日更新、用于判断关键航道“贸易是否正常往来”的聚合快照。它不是实时 GIS，也不发布单船敏感轨迹。

## 霍尔木兹 P0 数据结构

主数据采用 IMF PortWatch 的 `Daily_Chokepoints_Data` 公共查询服务：

- 霍尔木兹标识：`chokepoint6`
- 时间粒度：日
- 核心字段：总过境数、油轮、集装箱、干散货、杂货、Ro-Ro、估算运力
- 历史范围：自 2019 年起
- 当前实测延迟：约 4 日，可能随修订变化
- 使用要求：展示时注明 IMF PortWatch；不得把 AIS 推导值描述成港口或海事机关的最终统计

安全状态由 UKMTO/JMIC 与 NAVAREA IX 航行警告补充。它们回答“是否发生攻击、限制或航行危险”，不替代过境数。

## 每日产品口径

墨观只公开四个读者能理解的结果：

1. 最新可用日的过境总数与船型构成；
2. 相对发布前 30 个有效日基线的变化；
3. 相对战前一年中位数的正常化比例；
4. 最早 7 日与最近 7 日的方向变化；
5. 最新官方安全提示及数据置信说明。

“通行量上升”不等于“安全恢复”，“AIS 未见船舶”也不等于“海峡关闭”。
过去 30 日用于发布时形成未来 15 日推演；之后每日数据用于验证和版本更新，不回写原始推演。

## 更新

更新页面当前快照：

```bash
npm run hormuz:update
```

更新数据并同步推演验证状态：

```bash
npm run hormuz:daily
```

仅在终端查看抓取结果：

```bash
npm run hormuz:fetch
```

需要封存时，写入指定日期快照：

```bash
npm run hormuz:fetch -- --output transit-monitor/snapshots/YYYY-MM-DD.json
```

`current.json` 是页面读取的可变当前状态；`snapshots/` 中的日期文件用于历史复盘，不应被后续更新覆盖。

脚本只调用公开聚合接口，不抓取 MarineTraffic、MarineRadar 等商业船位网站。
