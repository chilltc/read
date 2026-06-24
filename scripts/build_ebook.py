#!/usr/bin/env python3
"""Build a mobile ebook data file from the source PDF."""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import pdfplumber
from pypdf import PdfReader


DEFAULT_PDF = Path(
    "/Users/heqinghuan/Library/Containers/com.tencent.xinWeChat/Data/Documents/"
    "xwechat_files/wxid_r8ah0qsk0yrl11_df61/msg/file/2026-06/"
    "王慧文清华产品课Allen修订版.pdf"
)

ROOT = Path(__file__).resolve().parents[1]
FIGURE_DIR = ROOT / "assets" / "figures"
DATA_FILE = ROOT / "ebook-data.js"

TOP_HEADINGS = {
    "前言",
    "战略",
    "Strategy for Product",
    "Strategy for Operation",
    "需求(Needs)",
    "供需关系(Demand and Supply)",
    "美团是家科技公司",
}

FULL_STOP = tuple("。！？；：.!?;:）】》”’")


def clean_line(line: str) -> str:
    line = line.strip()
    line = re.sub(r"\s+", " ", line)
    line = line.replace("à", " -> ")
    return line.strip()


def parse_outline(toc_text: str) -> list[dict]:
    outline: list[dict] = []
    for raw in toc_text.splitlines():
        line = clean_line(raw)
        if not line or line in {"王慧文清华产品课", "目录"}:
            continue

        match = re.match(r"^(?P<title>.+?)(?:[.…·\.\s]{2,}|[.…]+)(?P<page>\d+)$", line)
        if not match:
            match = re.match(r"^(?P<title>.+?)\s+(?P<page>\d+)$", line)
        if not match:
            continue

        title = match.group("title").strip(" .…·")
        title = re.sub(r"\s+", " ", title)
        page = int(match.group("page"))
        level = 1 if re.match(r"^[一二三四五六七八九十]+[、.]", title) else 2
        outline.append({"title": title, "page": page, "level": level})
    return outline


def is_heading(text: str) -> int | None:
    if text in TOP_HEADINGS:
        return 1
    if text == "Q&A":
        return 2
    if re.match(r"^[一二三四五六七八九十]+、", text):
        return 2
    if re.match(r"^\d+[.、]\s*\S+", text):
        return 3
    return None


def join_text(lines: list[str]) -> str:
    if not lines:
        return ""
    out = lines[0]
    for line in lines[1:]:
        prev = out[-1:] if out else ""
        first = line[:1]
        if prev and first and prev.isascii() and first.isascii() and prev.isalnum() and first.isalnum():
            out += " " + line
        else:
            out += line
    out = re.sub(r"\s{2,}", " ", out)
    out = re.sub(r"\s+([，。！？；：、）】》])", r"\1", out)
    out = re.sub(r"([（【《])\s+", r"\1", out)
    return out.strip()


def extract_figures(pdf_path: Path) -> dict[int, list[dict]]:
    FIGURE_DIR.mkdir(parents=True, exist_ok=True)
    for old in FIGURE_DIR.iterdir():
        if old.is_file():
            old.unlink()

    positions: dict[int, dict[str, dict]] = {}
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page_number, page in enumerate(pdf.pages, 1):
            for image in page.images:
                name = image.get("name")
                if not name:
                    continue
                positions.setdefault(page_number, {})[name] = {
                    "top": image.get("top", 9999),
                    "bottom": image.get("bottom", 9999),
                    "x0": image.get("x0", 0),
                }

    figures: dict[int, list[dict]] = {}
    reader = PdfReader(str(pdf_path))
    for page_number, page in enumerate(reader.pages, 1):
        try:
            images = list(page.images)
        except Exception:
            images = []

        for index, image in enumerate(images, 1):
            suffix = Path(image.name).suffix.lower() or ".png"
            image_key = Path(image.name).stem
            position = positions.get(page_number, {}).get(image_key, {})
            filename = f"page-{page_number:02d}-{index:02d}{suffix}"
            target = FIGURE_DIR / filename
            target.write_bytes(image.data)
            figures.setdefault(page_number, []).append(
                {
                    "src": f"assets/figures/{filename}",
                    "alt": f"第 {page_number} 页插图 {index}",
                    "top": position.get("top", 9999),
                    "bottom": position.get("bottom", 9999),
                    "x0": position.get("x0", index),
                }
            )
    for page_figures in figures.values():
        page_figures.sort(key=lambda item: (item["top"], item["x0"]))
    return figures


def figure_groups(page_figures: list[dict]) -> list[dict]:
    groups: list[dict] = []
    for figure in sorted(page_figures, key=lambda item: (item["top"], item["x0"])):
        if not groups or abs(figure["top"] - groups[-1]["top"]) > 28:
            groups.append({"top": figure["top"], "images": [figure]})
        else:
            groups[-1]["images"].append(figure)
            groups[-1]["top"] = min(groups[-1]["top"], figure["top"])

    for group in groups:
        group["images"].sort(key=lambda item: item["x0"])
    return groups


def build_blocks(pdf_path: Path, figures: dict[int, list[dict]]) -> tuple[list[dict], list[dict], str]:
    blocks: list[dict] = []
    buffer: list[str] = []

    def flush(page: int) -> None:
        nonlocal buffer
        text = join_text(buffer)
        if text:
            block_type = "qa" if re.match(r"^[QA]:", text) else "paragraph"
            blocks.append({"type": block_type, "text": text, "page": page})
        buffer = []

    with pdfplumber.open(str(pdf_path)) as pdf:
        toc_text = pdf.pages[0].extract_text(x_tolerance=2, y_tolerance=3) or ""
        outline = parse_outline(toc_text)

        for page_number, page in enumerate(pdf.pages[1:], 2):
            events = [
                {
                    "kind": "line",
                    "top": item.get("top", 0),
                    "text": item.get("text", ""),
                }
                for item in page.extract_text_lines(layout=False, strip=True)
            ]
            for group in figure_groups(figures.get(page_number, [])):
                events.append({"kind": "figures", "top": group["top"], "images": group["images"]})

            events.sort(key=lambda item: (item["top"], 1 if item["kind"] == "figures" else 0))

            for event in events:
                if event["kind"] == "figures":
                    flush(page_number)
                    blocks.append(
                        {
                            "type": "figures",
                            "page": page_number,
                            "images": event["images"],
                        }
                    )
                    continue

                line = clean_line(str(event["text"]))
                if not line:
                    flush(page_number)
                    continue
                depth = is_heading(line)
                if depth:
                    flush(page_number)
                    blocks.append(
                        {
                            "type": "heading",
                            "depth": depth,
                            "text": line,
                            "page": page_number,
                        }
                    )
                    continue

                if re.match(r"^[QA]:", line):
                    flush(page_number)
                    blocks.append({"type": "qa", "text": line, "page": page_number})
                    continue

                buffer.append(line)
                if line.endswith(FULL_STOP):
                    flush(page_number)

        flush(len(pdf.pages))

    return blocks, outline, toc_text


def main() -> None:
    pdf_path = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("EBOOK_SOURCE_PDF", DEFAULT_PDF))
    if not pdf_path.exists():
        raise SystemExit(f"PDF not found: {pdf_path}")

    figures = extract_figures(pdf_path)
    blocks, outline, _toc = build_blocks(pdf_path, figures)
    data = {
        "title": "王慧文清华产品课",
        "subtitle": "Allen 修订版",
        "source": pdf_path.name,
        "pageCount": 54,
        "outline": outline,
        "blocks": blocks,
    }

    DATA_FILE.write_text(
        "window.EBOOK_DATA = "
        + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {DATA_FILE.relative_to(ROOT)} with {len(blocks)} blocks and {sum(len(v) for v in figures.values())} figures.")


if __name__ == "__main__":
    main()
