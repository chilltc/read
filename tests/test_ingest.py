import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ingest", ROOT / "scripts" / "ingest.py")
ingest = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ingest)


class IngestMobiTest(unittest.TestCase):
    def test_build_document_reuses_existing_ebook_data_when_source_is_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data_file = root / "ebook-data.js"
            data_file.write_text(
                'window.EBOOK_DATA = {"documents":[{"id":"old-book","title":"Old",'
                '"subtitle":"","category":"产品","source":"missing.pdf","blocks":[{"type":"paragraph","text":"cached","page":1}],'
                '"outline":[],"pageCount":1}]};\n',
                encoding="utf-8",
            )
            entry = {
                "id": "old-book",
                "title": "Updated Title",
                "subtitle": "Updated Subtitle",
                "category": "更新分类",
                "source": "books/missing.pdf",
            }

            with (
                mock.patch.object(ingest, "ROOT", root),
                mock.patch.object(ingest, "DATA_FILE", data_file),
            ):
                document = ingest.build_document(entry)

        self.assertEqual(document["id"], "old-book")
        self.assertEqual(document["title"], "Updated Title")
        self.assertEqual(document["subtitle"], "Updated Subtitle")
        self.assertEqual(document["category"], "更新分类")
        self.assertEqual(document["blocks"][0]["text"], "cached")

    def test_discover_and_register_includes_mobi_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            books_dir = Path(tmp) / "books"
            books_dir.mkdir()
            manifest_path = books_dir / "manifest.json"
            manifest_path.write_text('{"books":[]}\n', encoding="utf-8")
            (books_dir / "Sample Book.mobi").write_text("mobi payload", encoding="utf-8")

            with mock.patch.object(ingest, "MANIFEST", manifest_path):
                manifest, new_ids = ingest.discover_and_register({"books": []})

        self.assertEqual(new_ids, ["sample-book"])
        self.assertEqual(
            manifest["books"][0],
            {
                "id": "sample-book",
                "title": "Sample Book",
                "subtitle": "",
                "category": "未分类",
                "source": "books/Sample Book.mobi",
            },
        )

    def test_discover_skips_mobi_already_listed_as_raw_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            books_dir = Path(tmp) / "books"
            books_dir.mkdir()
            manifest_path = books_dir / "manifest.json"
            manifest_path.write_text('{"books":[]}\n', encoding="utf-8")
            (books_dir / "Sample Book.mobi").write_text("mobi payload", encoding="utf-8")
            manifest = {
                "books": [
                    {
                        "id": "sample-book",
                        "title": "Sample Book",
                        "source": "books/sample-book.md",
                        "rawSource": "books/Sample Book.mobi",
                    }
                ]
            }

            with mock.patch.object(ingest, "MANIFEST", manifest_path):
                updated, new_ids = ingest.discover_and_register(manifest)

        self.assertEqual(new_ids, [])
        self.assertEqual(len(updated["books"]), 1)

    def test_read_source_text_routes_mobi_through_extractor(self):
        with tempfile.TemporaryDirectory() as tmp:
            source_path = Path(tmp) / "Sample Book.mobi"
            source_path.write_text("not extracted text", encoding="utf-8")

            with mock.patch.object(
                ingest,
                "mobi_to_text",
                return_value="# Sample Book\n\n正文",
                create=True,
            ) as extractor:
                text = ingest.read_source_text(source_path)

        self.assertEqual(text, "# Sample Book\n\n正文")
        extractor.assert_called_once_with(source_path)

    def test_mobi_to_text_falls_back_when_calibre_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            source_path = Path(tmp) / "Sample Book.mobi"
            source_path.write_text("mobi payload", encoding="utf-8")
            error = subprocess.CalledProcessError(
                1,
                ["ebook-convert"],
                stderr="calibre could not parse this file",
            )

            with (
                mock.patch.object(ingest.shutil, "which", return_value="/usr/bin/ebook-convert"),
                mock.patch.object(ingest.subprocess, "run", side_effect=error),
                mock.patch.object(ingest, "mobi_via_python_package", return_value="fallback text"),
            ):
                text = ingest.mobi_to_text(source_path)

        self.assertEqual(text, "fallback text")


if __name__ == "__main__":
    unittest.main()
