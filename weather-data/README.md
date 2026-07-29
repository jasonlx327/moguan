# 墨观天气快照

P0 只使用一个主天气图层：全球卫星云况。

当前快照采用 NASA GIBS 的 NOAA-20／VIIRS 每日真彩色观测合成。页面用于直观看到云系形态，但不把真彩色影像误称为定量云量，也不单凭影像判断首页事件的因果关系。

更新固定日期快照：

```bash
npm run weather:fetch -- --date YYYY-MM-DD
npm run weather:validate
```

每个 JSON 快照保存有效日期、采集时间、观测类型、空间与时间分辨率、WMS 请求、图像哈希和质量边界。
