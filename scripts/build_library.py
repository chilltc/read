#!/usr/bin/env python3
"""Build the multi-document mobile ebook library."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "ebook-data.js"
BACKUP_FILE = ROOT / "ebook-data.qinghua.js"
TOKEN_PDF = Path(
    "/Users/changgeng/Library/Containers/com.tencent.xinWeChat/Data/Documents/"
    "xwechat_files/wxid_5978059780711_fdf7/msg/attach/"
    "c54350731d4b9c19e77e0165fd1513c9/2026-06/Rec/dd15a8994827fba1/F/0/"
    "Token资本_天际资本战略报告.pdf"
)
FABLE_TEXT = Path("/Users/changgeng/.codex/attachments/b575184f-29ee-4471-8f92-bcf49d06a39f/pasted-text.txt")


def load_existing_data() -> dict:
    raw = DATA_FILE.read_text(encoding="utf-8")
    match = re.match(r"window\.EBOOK_DATA\s*=\s*(.*);\s*$", raw, re.S)
    if not match:
        raise SystemExit("Cannot parse existing ebook-data.js")
    data = json.loads(match.group(1))
    if "documents" in data:
        return data["documents"][0]
    BACKUP_FILE.write_text(raw, encoding="utf-8")
    return data


def clean_line(line: str) -> str:
    line = line.strip()
    line = re.sub(r"\s+", " ", line)
    return line.strip()


def join_lines(lines: list[str]) -> str:
    if not lines:
        return ""
    out = lines[0]
    for line in lines[1:]:
        if out and line and out[-1:].isascii() and line[:1].isascii() and out[-1:].isalnum() and line[:1].isalnum():
            out += " " + line
        else:
            out += line
    return re.sub(r"\s{2,}", " ", out).strip()


def add_paragraph(blocks: list[dict], buffer: list[str], page: int) -> None:
    text = join_lines(buffer)
    buffer.clear()
    if text:
        blocks.append({"type": "paragraph", "text": text, "page": page})


def token_pdf_text() -> str:
    result = subprocess.run(
        ["pdftotext", "-layout", str(TOKEN_PDF), "-"],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
    )
    return result.stdout


def build_token_report() -> dict:
    text = token_pdf_text()
    pages = text.split("\f")
    blocks: list[dict] = []
    outline: list[dict] = []
    buffer: list[str] = []
    title_seen = False

    for page_number, page_text in enumerate(pages, 1):
        for raw in page_text.splitlines():
            line = clean_line(raw)
            if not line:
                add_paragraph(blocks, buffer, page_number)
                continue
            if line.startswith("天际资本 FutureX") or line.startswith("机构内部") or re.match(r"^第 \d+ 页", line):
                continue
            if line in {"一", "二", "三", "四", "五"}:
                continue
            if "撰写：" in line or "密级：" in line:
                continue
            if not title_seen and line.startswith("Token 资本"):
                title_seen = True
                blocks.append({"type": "heading", "depth": 1, "text": "Token 资本", "page": page_number})
                outline.append({"title": "Token 资本", "page": page_number, "level": 1})
                continue
            if line.startswith("摘要："):
                add_paragraph(blocks, buffer, page_number)
                blocks.append({"type": "heading", "depth": 2, "text": "摘要", "page": page_number})
                outline.append({"title": "摘要", "page": page_number, "level": 2})
                rest = line.replace("摘要：", "").strip()
                if rest:
                    buffer.append(rest)
                continue
            if re.match(r"^[一二三四五六七八九十]+[、.]\s*", line):
                add_paragraph(blocks, buffer, page_number)
                blocks.append({"type": "heading", "depth": 2, "text": line, "page": page_number})
                outline.append({"title": line, "page": page_number, "level": 2})
                continue
            if re.match(r"^\d+\.\d+\s+", line):
                add_paragraph(blocks, buffer, page_number)
                blocks.append({"type": "heading", "depth": 3, "text": line, "page": page_number})
                outline.append({"title": line, "page": page_number, "level": 3})
                continue
            if line.startswith("表") and "Token" in line:
                add_paragraph(blocks, buffer, page_number)
                blocks.append({"type": "heading", "depth": 3, "text": line, "page": page_number})
                outline.append({"title": line, "page": page_number, "level": 3})
                continue
            buffer.append(line)
            if line.endswith(("。", "；", "：", ".", "?”", "”")):
                add_paragraph(blocks, buffer, page_number)

    add_paragraph(blocks, buffer, len(pages))
    return {
        "id": "token-capital-report",
        "title": "Token 资本",
        "subtitle": "天际资本战略报告",
        "source": TOKEN_PDF.name,
        "pageCount": 13,
        "outline": outline,
        "blocks": blocks,
    }


def build_fable_article() -> dict:
    text = FABLE_TEXT.read_text(encoding="utf-8")
    blocks: list[dict] = []
    outline: list[dict] = []
    buffer: list[str] = []
    lines = [clean_line(line) for line in text.splitlines()]
    title = lines[0]
    blocks.append({"type": "heading", "depth": 1, "text": title, "page": 1})
    outline.append({"title": title, "page": 1, "level": 1})
    page = 1
    pending_number = ""

    for line in lines[1:]:
        if not line or line == "图片":
            add_paragraph(blocks, buffer, page)
            continue
        if re.match(r"^\d{2}$", line):
            pending_number = line
            page = int(line)
            continue
        if pending_number:
            add_paragraph(blocks, buffer, page)
            heading = line
            blocks.append({"type": "heading", "depth": 2, "text": heading, "page": page})
            outline.append({"title": heading, "page": page, "level": 2})
            pending_number = ""
            continue
        if line == "导读：":
            add_paragraph(blocks, buffer, page)
            blocks.append({"type": "heading", "depth": 2, "text": "导读", "page": page})
            outline.append({"title": "导读", "page": page, "level": 2})
            continue
        if line.startswith("————") or line.startswith("—— 张倩"):
            add_paragraph(blocks, buffer, page)
            blocks.append({"type": "heading", "depth": 3, "text": line.strip("— "), "page": page})
            continue
        buffer.append(line)
        if line.endswith(("。", "！", "？", "：", "”")):
            add_paragraph(blocks, buffer, page)

    add_paragraph(blocks, buffer, page)
    return {
        "id": "fable-5-open-source-ai",
        "title": "Fable 5事件与中国开源AI",
        "subtitle": "当Anthropic最强AI模型被一纸政令关停",
        "source": FABLE_TEXT.name,
        "pageCount": 8,
        "outline": outline,
        "blocks": blocks,
    }


def main() -> None:
    qinghua = load_existing_data()
    qinghua["id"] = "qinghua-product-course"
    library = {
        "libraryTitle": "移动阅读书架",
        "documents": [
            qinghua,
            build_token_report(),
            build_fable_article(),
        ],
    }
    DATA_FILE.write_text(
        "window.EBOOK_DATA = " + json.dumps(library, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print("Wrote ebook-data.js with", len(library["documents"]), "documents")


if __name__ == "__main__":
    main()
