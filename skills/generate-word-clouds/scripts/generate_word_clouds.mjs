import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const [configPath, outputDir] = process.argv.slice(2);
if (!configPath || !outputDir) {
  throw new Error("用法：node generate_word_clouds.mjs config.json output-directory");
}

const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const lists = config.lists;
if (!Array.isArray(lists) || lists.length < 1 || lists.length > 10) {
  throw new Error("lists 必须包含 1–10 个列表");
}

const margin = Number.isFinite(config.margin) ? Math.max(0, config.margin) : 20;
await fs.mkdir(outputDir, { recursive: true });

function escapeXml(value) {
  return value.replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
  })[char]);
}

function safeName(value) {
  return String(value || "词云").replace(/[\\/:*?"<>|]/g, "_").trim() || "词云";
}

function normalizeWords(words, topN) {
  const merged = new Map();
  for (const item of words || []) {
    const text = String(item.text ?? "").trim();
    const weight = Number(item.weight);
    if (!text || !Number.isFinite(weight) || weight <= 0) continue;
    merged.set(text, (merged.get(text) || 0) + weight);
  }
  return [...merged.entries()]
    .map(([text, weight]) => ({ text, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, topN);
}

function overlaps(a, b, gap) {
  return !(a.x + a.w + gap < b.x || b.x + b.w + gap < a.x ||
    a.y + a.h + gap < b.y || b.y + b.h + gap < a.y);
}

function insideShape(box, shape, width, height) {
  const points = [
    [box.x, box.y], [box.x + box.w, box.y],
    [box.x, box.y + box.h], [box.x + box.w, box.y + box.h],
  ];
  const cx = width / 2;
  const cy = height / 2;
  const rx = width * 0.48;
  const ry = height * 0.46;
  return points.every(([x, y]) => {
    const nx = Math.abs(x - cx) / rx;
    const ny = Math.abs(y - cy) / ry;
    if (shape === "rectangle") return nx <= 1 && ny <= 1;
    if (shape === "diamond") return nx + ny <= 1;
    if (shape === "circle") {
      const radius = Math.min(rx, ry);
      return ((x - cx) ** 2 + (y - cy) ** 2) <= radius ** 2;
    }
    return nx ** 2 + ny ** 2 <= 1;
  });
}

function layout(words, shape, scale) {
  const width = shape === "circle" ? 1500 : 1800;
  const height = shape === "circle" ? 1500 : 1200;
  const weights = words.map((item) => item.weight);
  const minLog = Math.log(Math.min(...weights));
  const span = Math.max(0.0001, Math.log(Math.max(...weights)) - minLog);
  const placed = [];

  for (let index = 0; index < words.length; index++) {
    const item = words[index];
    const normalized = (Math.log(item.weight) - minLog) / span;
    const fontSize = Math.round((24 + normalized * 100) * scale);
    const boxWidth = Math.max(fontSize, item.text.length * fontSize * 1.03);
    const boxHeight = fontSize * 1.14;
    let box = null;

    for (let step = 0; step < 24000; step++) {
      const angle = step * 0.36;
      const radius = 6.2 * Math.sqrt(step);
      const x = width / 2 + Math.cos(angle) * radius - boxWidth / 2;
      const y = height / 2 + Math.sin(angle) * radius * 0.68 - boxHeight / 2;
      const candidate = { x, y, w: boxWidth, h: boxHeight, fontSize, index };
      if (insideShape(candidate, shape, width, height) &&
          !placed.some((existing) => overlaps(candidate, existing, 4))) {
        box = candidate;
        break;
      }
    }
    if (!box) return null;
    placed.push(box);
  }
  return { width, height, placed };
}

async function renderList(list) {
  const topN = Math.max(1, Math.floor(Number(list.topN) || 50));
  const words = normalizeWords(list.words, topN);
  if (!words.length) throw new Error(`${list.name || "未命名列表"}没有有效关键词`);

  const shape = ["ellipse", "circle", "rectangle", "diamond"].includes(list.shape)
    ? list.shape : "ellipse";
  const palette = Array.isArray(list.palette) && list.palette.length
    ? list.palette : ["#7A1F2B", "#C68A1D", "#E1B84B"];
  const background = list.background === "transparent"
    ? { r: 0, g: 0, b: 0, alpha: 0 } : (list.background || "#FFFFFF");

  let layoutResult = null;
  for (let scale = 1; scale >= 0.48 && !layoutResult; scale -= 0.04) {
    layoutResult = layout(words, shape, scale);
  }
  if (!layoutResult) throw new Error(`${list.name || "未命名列表"}无法容纳全部关键词`);

  const labels = layoutResult.placed.map((box) => {
    const item = words[box.index];
    const color = palette[(box.index * 2 + Math.floor(box.index / palette.length)) % palette.length];
    return `<text x="${(box.x + box.w / 2).toFixed(1)}" y="${(box.y + box.h / 2).toFixed(1)}"` +
      ` text-anchor="middle" dominant-baseline="central" font-size="${box.fontSize}"` +
      ` font-weight="${box.index < 8 ? 700 : 500}" fill="${escapeXml(color)}">` +
      `${escapeXml(item.text)}</text>`;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${layoutResult.width}" height="${layoutResult.height}"` +
    ` viewBox="0 0 ${layoutResult.width} ${layoutResult.height}">` +
    `<g font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif">${labels.join("")}</g></svg>`;

  const filename = `${safeName(list.name)}_TOP${words.length}_词云.png`;
  const outputPath = path.join(outputDir, filename);
  let pipeline = sharp(Buffer.from(svg))
    .png()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: margin, bottom: margin, left: margin, right: margin, background });
  if (list.background !== "transparent") pipeline = pipeline.flatten({ background });
  await pipeline.toFile(outputPath);

  const metadata = await sharp(outputPath).metadata();
  return {
    name: list.name,
    outputPath,
    words: words.length,
    width: metadata.width,
    height: metadata.height,
    shape,
    background: list.background || "transparent",
  };
}

const results = await Promise.all(lists.map((list) => renderList(list)));
console.log(JSON.stringify(results, null, 2));
