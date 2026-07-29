# Federal Register观象适配器

该适配器通过FederalRegister.gov无密钥API发现美国商务部产业安全局（BIS）发布的半导体、先进计算和半导体制造设备相关文件。

它只生成`discovery_candidate`，不自动确认事件，也不自动进入纪事或推演。

## 数据边界

- FederalRegister.gov用于搜索和取得结构化元数据；
- `official_pdf_url`必须指向GovInfo官方版本；
- 关键词命中不代表文件与中美欧半导体事件直接相关；
- 每条记录必须完成人工相关性审核和GovInfo原文核验；
- 当前快照只覆盖文件发布日期范围，不代表规则实际生效区间。

## 运行

```bash
npm run federal-register:fetch
```

指定窗口与输出：

```bash
node scripts/fetch-federal-register.mjs \
  --from 2026-06-29 \
  --to 2026-07-28 \
  --output guanxiang/federal-register/snapshots/2026-07-28-30d.json
```

校验快照：

```bash
npm run federal-register:validate
```

## 下一道人工门

人工审核至少确认：

1. 文件与首批事件的直接关系；
2. 文件类型、文号和发布机构；
3. GovInfo官方PDF可以访问；
4. 发布、生效、过渡和修订日期；
5. 受控产品、技术、主体、地域和许可状态；
6. 文件是否替代或修订既有规则。
