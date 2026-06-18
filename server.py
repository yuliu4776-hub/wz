#!/usr/bin/env python3
from __future__ import annotations

import base64
import io
import json
import sys
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image, ImageOps
from pyzbar.pyzbar import decode


ROOT = Path(__file__).resolve().parent
MAX_UPLOAD_BYTES = 12 * 1024 * 1024


class BarcodeHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        if urlparse(self.path).path != "/decode-barcode":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        content_length = int(self.headers.get("Content-Length", "0") or "0")
        if content_length <= 0 or content_length > MAX_UPLOAD_BYTES:
            self.send_json({"ok": False, "error": "图片为空或超过 12MB。"}, HTTPStatus.BAD_REQUEST)
            return

        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            image_bytes = parse_image_payload(payload)
            results = decode_image_bytes(image_bytes)
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return

        self.send_json({"ok": True, "results": results})

    def send_json(self, data, status=HTTPStatus.OK):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def parse_image_payload(payload: dict) -> bytes:
    data_url = payload.get("image")
    if not isinstance(data_url, str) or "," not in data_url:
        raise ValueError("缺少图片数据。")

    header, encoded = data_url.split(",", 1)
    if not header.startswith("data:image/"):
        raise ValueError("只支持图片数据。")

    try:
        return base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise ValueError("图片 Base64 解码失败。") from exc


def decode_image_bytes(image_bytes: bytes) -> list[dict]:
    image = Image.open(io.BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image).convert("RGB")

    for degrees in (0, 90, 180, 270):
        rotated = image.rotate(degrees, expand=True) if degrees else image
        results = []

        for item in decode(rotated):
            text = item.data.decode("utf-8", errors="replace")
            if not text:
                continue
            results.append(
                {
                    "text": text,
                    "format": item.type,
                    "orientation": getattr(item, "orientation", None),
                    "rotation": degrees,
                }
            )

        if results:
            return results

    return []


def main():
    host = "127.0.0.1"
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    httpd = ThreadingHTTPServer((host, port), BarcodeHandler)
    print(f"Serving ROBO::TRACK at http://{host}:{port}/robots.html")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
