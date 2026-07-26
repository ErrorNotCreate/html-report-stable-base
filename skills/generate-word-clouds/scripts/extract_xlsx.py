#!/usr/bin/env python3
import argparse
import json
from collections import defaultdict
from pathlib import Path

import openpyxl


KEYWORD_HINTS = ("关键词", "关键字", "词语", "词", "keyword", "word")
WEIGHT_HINTS = ("权重", "记录数", "频次", "次数", "数量", "count", "weight", "frequency")


def column_index(headers, hints, fallback):
    normalized = [str(value or "").strip().lower() for value in headers]
    for index, header in enumerate(normalized):
        if any(hint in header for hint in hints):
            return index
    return fallback


def main():
    parser = argparse.ArgumentParser(description="将 Excel 关键词表快速转换为词云配置 JSON")
    parser.add_argument("input_xlsx")
    parser.add_argument("output_json")
    parser.add_argument("--top-n", type=int, default=50)
    parser.add_argument("--background", default="transparent")
    parser.add_argument("--shape", default="ellipse")
    parser.add_argument("--margin", type=int, default=20)
    parser.add_argument("--palette-file")
    args = parser.parse_args()

    palettes = {}
    if args.palette_file:
        palette_data = json.loads(Path(args.palette_file).read_text(encoding="utf-8"))
        palettes = {
            name: value.get("palette", []) if isinstance(value, dict) else value
            for name, value in palette_data.items()
        }

    workbook = openpyxl.load_workbook(args.input_xlsx, read_only=True, data_only=True)
    lists = []

    for sheet in workbook.worksheets:
        rows = sheet.iter_rows(values_only=True)
        headers = next(rows, None)
        if not headers:
            continue

        keyword_col = column_index(headers, KEYWORD_HINTS, 0)
        weight_col = column_index(headers, WEIGHT_HINTS, 1 if len(headers) > 1 else 0)
        merged = defaultdict(float)

        for row in rows:
            if keyword_col >= len(row) or weight_col >= len(row):
                continue
            text = str(row[keyword_col] or "").strip()
            try:
                weight = float(row[weight_col])
            except (TypeError, ValueError):
                continue
            if text and weight > 0:
                merged[text] += weight

        words = [
            {"text": text, "weight": weight}
            for text, weight in sorted(merged.items(), key=lambda item: item[1], reverse=True)
        ][: max(1, args.top_n)]
        if not words:
            continue

        lists.append({
            "name": sheet.title,
            "topN": max(1, args.top_n),
            "background": args.background,
            "shape": args.shape,
            "palette": palettes.get(sheet.title, ["#7A1F2B", "#C68A1D", "#E1B84B"]),
            "words": words,
        })

    if not lists:
        raise SystemExit("未找到有效的关键词和正数权重")
    if len(lists) > 10:
        raise SystemExit("工作表超过 10 个，请拆分批次")

    output = {"margin": max(0, args.margin), "lists": lists}
    Path(args.output_json).write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps({
        "lists": [{"name": item["name"], "words": len(item["words"])} for item in lists],
        "output": args.output_json,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
