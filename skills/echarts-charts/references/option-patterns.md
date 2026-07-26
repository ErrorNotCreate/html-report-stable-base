# ECharts Option Patterns

## 基础骨架

```js
{
  color: ["#2563EB", "#16A34A", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4"],
  tooltip: { trigger: "axis" },
  legend: { top: 8 },
  grid: { left: 48, right: 28, top: 72, bottom: 56, containLabel: true },
  dataset: { source: [] },
  xAxis: { type: "category" },
  yAxis: { type: "value" },
  toolbox: { right: 12, feature: { saveAsImage: {} } },
  series: []
}
```

## 柱状图/条形图

适合排名、分组对比。类目很多时使用横向条形图。

```js
{
  tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
  dataset: { source: [["name", "value"], ["A", 120], ["B", 88]] },
  xAxis: { type: "category", axisLabel: { interval: 0, rotate: 30 } },
  yAxis: { type: "value" },
  series: [{ type: "bar", encode: { x: "name", y: "value" }, barMaxWidth: 42 }]
}
```

横向条形图交换坐标轴：

```js
{
  xAxis: { type: "value" },
  yAxis: { type: "category", inverse: true },
  series: [{ type: "bar", encode: { x: "value", y: "name" } }]
}
```

## 折线图

适合时间趋势。点很多时启用 `dataZoom`。

```js
{
  tooltip: { trigger: "axis" },
  dataset: { source: [["date", "sales"], ["2026-01", 120], ["2026-02", 168]] },
  xAxis: { type: "category", boundaryGap: false },
  yAxis: { type: "value" },
  dataZoom: [{ type: "inside" }, { type: "slider", height: 22 }],
  series: [{ type: "line", encode: { x: "date", y: "sales" }, smooth: true, symbolSize: 6 }]
}
```

## 饼图/环形图

适合少量构成。超过 8 个分类时优先改用条形图。

```js
{
  tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
  legend: { bottom: 0 },
  dataset: { source: [["name", "value"], ["A", 40], ["B", 32]] },
  series: [{
    type: "pie",
    radius: ["42%", "68%"],
    encode: { itemName: "name", value: "value" },
    label: { formatter: "{b}\\n{d}%" }
  }]
}
```

## 双轴组合图

适合“量级 + 比率”同屏展示。左轴放绝对值，右轴放百分比或均价。

```js
{
  tooltip: { trigger: "axis" },
  legend: {},
  dataset: { source: [["month", "volume", "rate"], ["Jan", 1200, 0.18]] },
  xAxis: { type: "category" },
  yAxis: [{ type: "value", name: "数量" }, { type: "value", name: "比例", axisLabel: { formatter: "{value}%" } }],
  series: [
    { type: "bar", name: "数量", encode: { x: "month", y: "volume" } },
    { type: "line", name: "比例", yAxisIndex: 1, encode: { x: "month", y: "rate" } }
  ]
}
```

## 交付检查

- 图表容器有明确高度。
- `series` 不为空。
- `dataset.source` 的首行字段名与 `encode` 一致。
- 中文标题、图例、轴标签可读。
- 长标签已旋转、截断或改为横向条形图。
