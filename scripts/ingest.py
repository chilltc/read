#!/usr/bin/env python3
"""通用书架 ingest：把 books/ 里的 PDF/TXT/MD 转成 ebook-data.js。

用法：
    python3 scripts/ingest.py            # 扫描 books/，自动登记新书并重建书架

设计目标（替代旧的 build_ebook.py / build_library.py）：
- 零手工登记：直接把文件丢进 books/，脚本自动发现并写进 manifest.json（用文件名当 id/标题）。
- 不为每本书手写代码：解析逻辑通用。
- 零额外依赖：默认用 pdftotext（poppler）抽取文本，无需 pip 安装。
- 数据隔离：只写 ebook-data.js，绝不碰 brain-data.js（脑页）。

章节识别是启发式的，对排版差的 PDF 不保证 100% 准确。
manifest 里可给某本书加 "headings": [...] 数组做人工覆盖，也可改 title/subtitle/category。
下划线开头的文件（如 _test.md）视为临时文件，自动跳过。
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "books" / "manifest.json"
DATA_FILE = ROOT / "ebook-data.js"

FULL_STOP = tuple("。！？；：.!?;:）】》”’")


def clean_line(line: str) -> str:
    line = line.strip()
    line = re.sub(r"\s+", " ", line)
    line = line.replace("à", " -> ")
    return line.strip()


def join_text(lines: list[str]) -> str:
    """合并连续行：中文直接拼，ASCII 单词间补空格（沿用 build_ebook 的规则）。"""
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


def guess_heading_depth(text: str, override_set: set[str]) -> int | None:
    """启发式判断一行是否是标题，返回层级 1/2/3，否则 None。"""
    if text in override_set:
        return 1
    # Markdown 标题
    md = re.match(r"^(#{1,4})\s+\S", text)
    if md:
        return min(len(md.group(1)), 3)
    if text == "Q&A":
        return 2
    # 中文一级：「一、」「二、」
    if re.match(r"^[一二三四五六七八九十百]+[、.]\s*\S", text):
        return 2
    # 「第N章/节」
    if re.match(r"^第[一二三四五六七八九十百\d]+[章节回部篇]\b", text):
        return 1
    # 数字层级：「1.」「1、」「1.1」
    if re.match(r"^\d+\.\d+\s+\S", text):
        return 3
    if re.match(r"^\d+[.、]\s*\S", text):
        return 3
    return None


def strip_heading_marker(text: str) -> str:
    return re.sub(r"^#{1,4}\s+", "", text).strip()


def pdf_to_text(path: Path) -> str:
    """用 pdftotext -layout 抽取文本（页用 \\f 分隔）。"""
    result = subprocess.run(
        ["pdftotext", "-layout", str(path), "-"],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
    )
    return result.stdout


def read_source_text(source_path: Path) -> str:
    suffix = source_path.suffix.lower()
    if suffix == ".pdf":
        return pdf_to_text(source_path)
    return source_path.read_text(encoding="utf-8")


def build_blocks(text: str, override_headings: list[str]) -> tuple[list[dict], list[dict]]:
    """把纯文本切成 blocks（heading/paragraph/qa）和 outline。"""
    override_set = {clean_line(h) for h in (override_headings or [])}
    blocks: list[dict] = []
    outline: list[dict] = []
    buffer: list[str] = []

    pages = text.split("\f") if "\f" in text else [text]

    def flush(page: int) -> None:
        nonlocal buffer
        joined = join_text(buffer)
        buffer = []
        if not joined:
            return
        block_type = "qa" if re.match(r"^[QA][:：]", joined) else "paragraph"
        blocks.append({"type": block_type, "text": joined, "page": page})

    for page_number, page_text in enumerate(pages, 1):
        for raw in page_text.splitlines():
            line = clean_line(raw)
            if not line:
                flush(page_number)
                continue

            depth = guess_heading_depth(line, override_set)
            if depth:
                flush(page_number)
                title = strip_heading_marker(line)
                blocks.append({"type": "heading", "depth": depth, "text": title, "page": page_number})
                outline.append({"title": title, "page": page_number, "level": depth})
                continue

            if re.match(r"^[QA][:：]", line):
                flush(page_number)
                blocks.append({"type": "qa", "text": line, "page": page_number})
                continue

            buffer.append(line)
            if line.endswith(FULL_STOP):
                flush(page_number)

    flush(len(pages))
    return blocks, outline


def build_document(entry: dict) -> dict:
    source_path = (ROOT / entry["source"]).resolve()
    if not source_path.exists():
        raise SystemExit(f"源文件不存在：{entry['source']}（id={entry.get('id')}）")

    text = read_source_text(source_path)
    blocks, outline = build_blocks(text, entry.get("headings", []))

    page_count = (text.count("\f") + 1) if "\f" in text else 1
    return {
        "id": entry["id"],
        "title": entry.get("title", entry["id"]),
        "subtitle": entry.get("subtitle", ""),
        "category": entry.get("category", "未分类"),
        "source": source_path.name,
        "pageCount": page_count,
        "outline": outline,
        "blocks": blocks,
    }


SUPPORTED_SUFFIXES = {".pdf", ".txt", ".md"}


def slugify(name: str) -> str:
    """把文件名转成英文 id：ASCII 部分小写连字符，中文则退化为拼音无关的安全串。"""
    stem = Path(name).stem
    # 优先用 ASCII 字母数字
    ascii_slug = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")
    if ascii_slug:
        return ascii_slug
    # 全中文/无 ASCII：用 book + 原 stem 里保留的字符（manifest 仍可读，id 唯一即可）
    safe = re.sub(r"\s+", "-", stem.strip())
    return "book-" + safe if safe else "book"


def discover_and_register(manifest: dict) -> tuple[dict, list[str]]:
    """扫描 books/ 目录，把未登记的文件自动加进 manifest.books。

    返回 (更新后的 manifest, 新登记的 id 列表)。
    - id 以文件名推导（slugify），与已有冲突则加数字后缀。
    - title 默认用文件名 stem，用户之后可在 manifest 里改。
    - 下划线开头的文件（如 _test-book.md）视为临时文件，跳过。
    """
    books_dir = MANIFEST.parent
    entries = manifest.setdefault("books", [])
    registered_sources = {e.get("source") for e in entries}
    existing_ids = {e.get("id") for e in entries}
    new_ids: list[str] = []

    for path in sorted(books_dir.iterdir()):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED_SUFFIXES:
            continue
        if path.name.startswith("_") or path.name == "manifest.json":
            continue
        rel = f"books/{path.name}"
        if rel in registered_sources:
            continue
        # 生成唯一 id
        base = slugify(path.name)
        book_id = base
        suffix = 2
        while book_id in existing_ids:
            book_id = f"{base}-{suffix}"
            suffix += 1
        existing_ids.add(book_id)
        entries.append(
            {
                "id": book_id,
                "title": path.stem,
                "subtitle": "",
                "category": "未分类",
                "source": rel,
            }
        )
        new_ids.append(book_id)

    return manifest, new_ids


def main() -> None:
    if not MANIFEST.exists():
        raise SystemExit(f"找不到 manifest：{MANIFEST}")

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))

    # 自动发现：把 books/ 里未登记的文件加进 manifest，并回写。
    manifest, new_ids = discover_and_register(manifest)
    if new_ids:
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"自动登记了 {len(new_ids)} 本新书：{', '.join(new_ids)}")
        print("（标题默认用了文件名，可在 books/manifest.json 里改 title/subtitle/category）")

    entries = manifest.get("books", [])
    if not entries:
        raise SystemExit("books/ 里没有书，也没有 manifest 记录。先把 PDF/txt/md 丢进 books/。")

    documents = []
    for entry in entries:
        if not entry.get("id") or not entry.get("source"):
            print(f"跳过缺少 id/source 的条目：{entry}", file=sys.stderr)
            continue
        doc = build_document(entry)
        documents.append(doc)
        heads = sum(1 for b in doc["blocks"] if b["type"] == "heading")
        print(f"  · {doc['id']}: {len(doc['blocks'])} blocks, {heads} headings, {doc['pageCount']} pages")

    library = {
        "libraryTitle": manifest.get("libraryTitle", "移动阅读书架"),
        "documents": documents,
    }
    DATA_FILE.write_text(
        "window.EBOOK_DATA = " + json.dumps(library, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"已写入 {DATA_FILE.relative_to(ROOT)}，共 {len(documents)} 本。")


if __name__ == "__main__":
    main()
