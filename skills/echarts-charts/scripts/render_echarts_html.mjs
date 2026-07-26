import fs from "node:fs/promises";
import path from "node:path";

const [configPath, outputPath] = process.argv.slice(2);
if (!configPath || !outputPath) {
  throw new Error("Usage: node render_echarts_html.mjs config.json output.html");
}

const config = JSON.parse(await fs.readFile(configPath, "utf8"));
if (!config.option || typeof config.option !== "object") {
  throw new Error("config.option is required and must be an object");
}

const title = config.title || config.option.title?.text || "ECharts Chart";
const subtitle = config.subtitle || config.option.title?.subtext || "";
const width = Number.isFinite(config.width) ? config.width : 1200;
const height = Number.isFinite(config.height) ? config.height : 720;
const theme = config.theme || "default";
const renderer = config.renderer || "canvas";
const echartsUrl = config.echartsUrl || "https://cdn.jsdelivr.net/npm/echarts@6/dist/echarts.min.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function serializeOption(value) {
  const placeholders = [];
  const json = JSON.stringify(value, (key, item) => {
    if (typeof item === "string" && /^\s*function\s*\(/.test(item)) {
      const token = `__ECHARTS_FUNCTION_${placeholders.length}__`;
      placeholders.push({ token, source: item });
      return token;
    }
    return item;
  }, 2);

  return placeholders.reduce((source, item) => (
    source.replace(`"${item.token}"`, item.source)
  ), json);
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      font-family: "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
      background: #f6f7fb;
      color: #172033;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
    }
    main {
      width: min(100%, ${width}px);
      background: #fff;
      border-radius: 18px;
      box-shadow: 0 18px 60px rgba(23, 32, 51, 0.12);
      padding: 22px 22px 14px;
      box-sizing: border-box;
    }
    header {
      padding: 0 2px 12px;
    }
    h1 {
      margin: 0;
      font-size: 22px;
      line-height: 1.35;
      font-weight: 700;
    }
    p {
      margin: 6px 0 0;
      color: #697386;
      font-size: 13px;
    }
    #chart {
      width: 100%;
      height: ${height}px;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
    </header>
    <div id="chart" role="img" aria-label="${escapeHtml(title)}"></div>
  </main>
  <script src="${escapeHtml(echartsUrl)}"></script>
  <script>
    const option = ${serializeOption(config.option)};
    const chart = echarts.init(document.getElementById("chart"), ${JSON.stringify(theme)}, {
      renderer: ${JSON.stringify(renderer)}
    });
    chart.setOption(option);
    window.addEventListener("resize", () => chart.resize());
  </script>
</body>
</html>
`;

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, html, "utf8");
console.log(JSON.stringify({ outputPath, title, width, height }, null, 2));
