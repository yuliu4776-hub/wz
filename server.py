#!/usr/bin/env python3
from __future__ import annotations

import base64
import io
import json
import re
import sys
from functools import lru_cache
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

try:
    import numpy as np
except Exception:  # pragma: no cover - optional runtime dependency
    np = None

try:
    from scipy import ndimage
except Exception:  # pragma: no cover - optional runtime dependency
    ndimage = None

try:
    from pyzbar.pyzbar import decode as zbar_decode
except Exception:  # pragma: no cover - OCR fallback can still run without zbar
    zbar_decode = None


ROOT = Path(__file__).resolve().parent
MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_DECODE_SIDE = 2400
OCR_MAX_SIDE = 1400
OCR_TEMPLATE_SIZE = 32
DIGIT_RUN_RE = re.compile(r"\d{6,12}")
FONT_PATHS = (
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/ttf-bitstream-vera/Vera.ttf",
    "/usr/share/fonts/truetype/ttf-bitstream-vera/VeraBd.ttf",
)


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
            known_serials = parse_known_serials(payload.get("knownSerials"))
            results = decode_image_bytes(
                image_bytes,
                known_serials,
                use_ocr=payload.get("useOcr") is True,
                fast_only=payload.get("fastOnly") is True,
            )
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


def parse_known_serials(value) -> list[str]:
    if not isinstance(value, list):
        return []

    serials = []
    seen = set()
    for item in value[:2000]:
        text = str(item or "").strip()
        if not text or len(text) > 64 or text in seen:
            continue
        seen.add(text)
        serials.append(text)
    return serials


def decode_image_bytes(
    image_bytes: bytes,
    known_serials: list[str] | None = None,
    use_ocr: bool = True,
    fast_only: bool = False,
) -> list[dict]:
    image = Image.open(io.BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image).convert("RGB")

    barcode_results = decode_barcode_variants(image, fast_only=fast_only)
    if barcode_results:
        return barcode_results

    return decode_digits_with_ocr(image, known_serials or []) if use_ocr else []


def decode_barcode_variants(image: Image.Image, fast_only: bool = False) -> list[dict]:
    if zbar_decode is None:
        return []

    bases = [(label, resize_image(base, max_side=MAX_DECODE_SIDE)) for label, base in iter_barcode_base_images(image)]
    for mode in ("fast", "enhanced"):
        if fast_only and mode != "fast":
            continue
        for base_label, base in bases:
            for degrees in (0, 90, 270, 180):
                rotated = base.rotate(degrees, expand=True) if degrees else base
                for prep_label, prepared in iter_barcode_preparations(rotated, mode):
                    results = decode_with_zbar(prepared, base_label, prep_label, degrees)
                    if results:
                        return results

    return []


def decode_with_zbar(image: Image.Image, base_label: str, prep_label: str, degrees: int) -> list[dict]:
    results = []
    for item in zbar_decode(image):
        text = item.data.decode("utf-8", errors="replace").strip()
        if not text:
            continue
        results.append(
            {
                "text": text,
                "format": item.type,
                "orientation": getattr(item, "orientation", None),
                "rotation": degrees,
                "source": f"{base_label}/{prep_label}",
            }
        )

    return results


def iter_barcode_base_images(image: Image.Image):
    yield "full", image

    crop = find_bright_label_crop(image)
    if crop is not None:
        yield "label-crop", crop

    center = center_crop(image, 0.84)
    if center.size != image.size:
        yield "center-crop", center


def iter_barcode_preparations(image: Image.Image, mode: str = "enhanced"):
    yield "raw", image

    gray = ImageOps.autocontrast(ImageOps.grayscale(image), cutoff=1)
    yield "gray", gray

    if mode == "fast":
        return

    enhanced = ImageEnhance.Contrast(gray).enhance(1.75)
    enhanced = enhanced.filter(ImageFilter.UnsharpMask(radius=1, percent=180, threshold=3))
    yield "contrast-sharp", enhanced

    if np is None:
        return

    arr = np.array(enhanced)
    thresholds = unique_thresholds(
        otsu_threshold(arr),
        int(np.percentile(arr, 42)),
        int(np.percentile(arr, 52)),
    )
    for threshold in thresholds:
        binary = Image.fromarray(np.where(arr < threshold, 0, 255).astype("uint8"), "L")
        yield f"binary-{threshold}", binary


def find_bright_label_crop(image: Image.Image) -> Image.Image | None:
    if np is None:
        return None

    thumb = image.copy()
    thumb.thumbnail((800, 800))
    gray = np.array(ImageOps.grayscale(thumb))
    threshold = max(150, int(np.percentile(gray, 78)))
    mask = gray >= threshold

    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None

    x1, x2 = int(xs.min()), int(xs.max()) + 1
    y1, y2 = int(ys.min()), int(ys.max()) + 1
    tw, th = thumb.size
    if (x2 - x1) * (y2 - y1) > tw * th * 0.92:
        return None

    margin = int(max(tw, th) * 0.035)
    x1, y1 = max(0, x1 - margin), max(0, y1 - margin)
    x2, y2 = min(tw, x2 + margin), min(th, y2 + margin)

    sx, sy = image.width / tw, image.height / th
    bbox = (
        max(0, int(x1 * sx)),
        max(0, int(y1 * sy)),
        min(image.width, int(x2 * sx)),
        min(image.height, int(y2 * sy)),
    )
    if bbox[2] - bbox[0] < image.width * 0.08 or bbox[3] - bbox[1] < image.height * 0.08:
        return None

    return image.crop(bbox)


def center_crop(image: Image.Image, ratio: float) -> Image.Image:
    if ratio >= 1:
        return image
    w, h = image.size
    nw, nh = int(w * ratio), int(h * ratio)
    left = max(0, (w - nw) // 2)
    top = max(0, (h - nh) // 2)
    return image.crop((left, top, left + nw, top + nh))


def resize_image(image: Image.Image, max_side: int, min_side: int = 0) -> Image.Image:
    w, h = image.size
    side = max(w, h)
    scale = 1.0
    if side > max_side:
        scale = max_side / side
    elif min_side and side < min_side:
        scale = min_side / side

    if abs(scale - 1.0) < 0.01:
        return image

    return image.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.LANCZOS)


def unique_thresholds(*values: int) -> list[int]:
    thresholds = []
    for value in values:
        value = max(1, min(254, int(value)))
        if all(abs(value - existing) > 4 for existing in thresholds):
            thresholds.append(value)
    return thresholds


def otsu_threshold(arr) -> int:
    if np is None:
        return 128

    hist = np.bincount(arr.astype("uint8").ravel(), minlength=256).astype(float)
    total = arr.size
    sum_total = float(np.dot(np.arange(256), hist))
    sum_back = 0.0
    weight_back = 0.0
    max_variance = -1.0
    threshold = 128

    for value in range(256):
        weight_back += hist[value]
        if weight_back == 0:
            continue

        weight_fore = total - weight_back
        if weight_fore == 0:
            break

        sum_back += value * hist[value]
        mean_back = sum_back / weight_back
        mean_fore = (sum_total - sum_back) / weight_fore
        variance = weight_back * weight_fore * (mean_back - mean_fore) ** 2
        if variance > max_variance:
            max_variance = variance
            threshold = value

    return threshold


def decode_digits_with_ocr(image: Image.Image, known_serials: list[str]) -> list[dict]:
    if np is None:
        return []

    known_values = build_known_digit_values(known_serials or load_local_known_serials())
    candidates = []

    for base_label, base in iter_ocr_base_images(image):
        base = resize_image(base, max_side=OCR_MAX_SIDE, min_side=900)
        for degrees in (0, 90, 270, 180):
            rotated = base.rotate(degrees, expand=True) if degrees else base
            new_candidates = extract_digit_candidates(rotated, base_label, degrees, known_values)
            candidates.extend(new_candidates)
            ready = choose_ocr_candidate(new_candidates)
            if ready:
                return [format_ocr_result(ready)]

    if not candidates:
        return []

    best = choose_ocr_candidate(candidates)
    if not best:
        return []

    return [format_ocr_result(best)]


def choose_ocr_candidate(candidates: list[dict]) -> dict | None:
    if not candidates:
        return None

    best = min(candidates, key=lambda item: item["rank"])
    if not best["matched_known"] and best["mean_score"] > 0.18:
        return None

    if best["matched_known"] or best["mean_score"] <= 0.12:
        return best

    return None


def format_ocr_result(best: dict) -> dict:
    result = {
        "text": best["text"],
        "format": "OCR-DIGITS",
        "rotation": best["rotation"],
        "source": best["source"],
        "confidence": round(max(0.0, min(1.0, 1.0 - best["mean_score"] * 3.2)), 3),
    }
    if best.get("corrected_from") and best["corrected_from"] != best["text"]:
        result["corrected_from"] = best["corrected_from"]
    return result


def iter_ocr_base_images(image: Image.Image):
    crop = find_bright_label_crop(image)
    if crop is not None:
        yield "label-crop", crop
    else:
        yield "full", image


def extract_digit_candidates(image: Image.Image, base_label: str, degrees: int, known_values: set[str]) -> list[dict]:
    gray = ImageOps.autocontrast(ImageOps.grayscale(image), cutoff=1)
    gray = gray.filter(ImageFilter.SHARPEN)
    arr = np.array(gray)
    thresholds = unique_thresholds(
        min(otsu_threshold(arr) + 10, int(np.percentile(arr, 48))),
        int(np.percentile(arr, 38)),
        int(np.percentile(arr, 55)),
    )

    candidates = []
    for threshold in thresholds:
        dark = arr < threshold
        candidates.extend(read_digit_sequences(dark, base_label, degrees, f"threshold-{threshold}", known_values))

    return candidates


def read_digit_sequences(mask, base_label: str, degrees: int, prep_label: str, known_values: set[str]) -> list[dict]:
    components = filter_digit_components(connected_components(mask), mask.shape)
    sequences = group_digit_components(components)
    candidates = []

    for sequence in sequences:
        if not 6 <= len(sequence) <= 12:
            continue

        digits = []
        scores = []
        for component in sequence:
            digit_mask = normalize_digit_component(mask, component)
            if digit_mask is None:
                break
            digit, score = classify_digit(digit_mask, component)
            digits.append(digit)
            scores.append(score)
        else:
            raw_text = "".join(digits)
            corrected_text, matched_known = correct_digit_candidate(raw_text, known_values)
            mean_score = sum(scores) / len(scores)
            rank = mean_score
            if matched_known:
                rank -= 0.12
            if corrected_text in known_values:
                rank -= 0.06

            candidates.append(
                {
                    "text": corrected_text,
                    "corrected_from": raw_text,
                    "matched_known": matched_known,
                    "mean_score": mean_score,
                    "rank": rank,
                    "rotation": degrees,
                    "source": f"{base_label}/{prep_label}/数字识别",
                }
            )

    return candidates


def connected_components(mask) -> list[tuple[int, int, int, int, int]]:
    if ndimage is not None:
        labeled, count = ndimage.label(mask)
        slices = ndimage.find_objects(labeled)
        components = []
        for index, region in enumerate(slices, start=1):
            if region is None:
                continue
            y_slice, x_slice = region
            area = int((labeled[region] == index).sum())
            components.append((x_slice.start, y_slice.start, x_slice.stop, y_slice.stop, area))
        return components

    h, w = mask.shape
    seen = np.zeros(mask.shape, dtype=bool)
    components = []

    for y in range(h):
        starts = np.where(mask[y] & ~seen[y])[0]
        for x in starts:
            if seen[y, x] or not mask[y, x]:
                continue

            stack = [(int(x), int(y))]
            seen[y, x] = True
            min_x = max_x = int(x)
            min_y = max_y = int(y)
            area = 0

            while stack:
                cx, cy = stack.pop()
                area += 1
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)

                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((nx, ny))

            components.append((min_x, min_y, max_x + 1, max_y + 1, area))

    return components


def filter_digit_components(components: list[tuple[int, int, int, int, int]], shape) -> list[dict]:
    h, w = shape
    filtered = []
    for x1, y1, x2, y2, area in components:
        box_w = x2 - x1
        box_h = y2 - y1
        if area < max(18, h * w * 0.000015):
            continue
        if box_h < max(12, h * 0.035) or box_h > h * 0.55:
            continue
        if box_w < max(4, w * 0.006) or box_w > w * 0.24:
            continue

        ratio = box_w / max(1, box_h)
        density = area / max(1, box_w * box_h)
        if not 0.12 <= ratio <= 1.25:
            continue
        if not 0.06 <= density <= 0.82:
            continue

        filtered.append(
            {
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "w": box_w,
                "h": box_h,
                "area": area,
                "cy": (y1 + y2) / 2,
            }
        )

    return filtered


def group_digit_components(components: list[dict]) -> list[list[dict]]:
    rows = []
    for component in sorted(components, key=lambda item: (item["cy"], item["x1"])):
        placed = False
        for row in rows:
            if abs(component["cy"] - row["cy"]) <= max(component["h"], row["h"]) * 0.55:
                row["items"].append(component)
                row["cy"] = (row["cy"] * row["count"] + component["cy"]) / (row["count"] + 1)
                row["h"] = max(row["h"], component["h"])
                row["count"] += 1
                placed = True
                break
        if not placed:
            rows.append({"cy": component["cy"], "h": component["h"], "count": 1, "items": [component]})

    sequences = []
    for row in rows:
        items = sorted(row["items"], key=lambda item: item["x1"])
        current = []
        previous = None
        for item in items:
            if previous and item["x1"] - previous["x2"] > max(row["h"] * 1.15, previous["w"] * 2.4):
                if len(current) >= 6:
                    sequences.append(current)
                current = []
            current.append(item)
            previous = item

        if len(current) >= 6:
            sequences.append(current)

    return sequences


def normalize_digit_component(mask, component: dict):
    pad = max(2, int(component["h"] * 0.08))
    h, w = mask.shape
    x1 = max(0, component["x1"] - pad)
    y1 = max(0, component["y1"] - pad)
    x2 = min(w, component["x2"] + pad)
    y2 = min(h, component["y2"] + pad)
    crop = mask[y1:y2, x1:x2]
    ys, xs = np.where(crop)
    if len(xs) == 0:
        return None

    crop = crop[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    source = Image.fromarray(np.where(crop, 0, 255).astype("uint8"), "L")
    scale = min((OCR_TEMPLATE_SIZE - 4) / source.width, (OCR_TEMPLATE_SIZE - 4) / source.height)
    resized = source.resize(
        (max(1, int(source.width * scale)), max(1, int(source.height * scale))),
        Image.Resampling.BILINEAR,
    )
    canvas = Image.new("L", (OCR_TEMPLATE_SIZE, OCR_TEMPLATE_SIZE), 255)
    canvas.paste(resized, ((OCR_TEMPLATE_SIZE - resized.width) // 2, (OCR_TEMPLATE_SIZE - resized.height) // 2))
    return np.array(canvas) < 180


def classify_digit(mask, component: dict) -> tuple[str, float]:
    scores = []
    for digit, templates in digit_templates().items():
        best = min(template_distance(mask, template) for template in templates)
        scores.append((best, digit))
    scores.sort()

    best_score, best_digit = scores[0]
    score_by_digit = {digit: score for score, digit in scores}
    ratio = component["w"] / max(1, component["h"])
    one_score = score_by_digit.get("1", 1.0)
    if ratio < 0.45 and best_digit in {"4", "7"} and one_score < best_score + 0.22:
        return "1", min(one_score, best_score + 0.04)

    return best_digit, best_score


def template_distance(mask, template) -> float:
    xor = np.mean(mask != template)
    horizontal = np.abs(mask.mean(axis=1) - template.mean(axis=1)).mean()
    vertical = np.abs(mask.mean(axis=0) - template.mean(axis=0)).mean()
    return float(xor + 0.6 * (horizontal + vertical))


@lru_cache(maxsize=1)
def digit_templates() -> dict[str, tuple]:
    templates: dict[str, list] = {digit: [] for digit in "0123456789"}
    font_paths = [path for path in FONT_PATHS if Path(path).exists()]

    for font_path in font_paths:
        for size in (38, 44, 50, 56):
            try:
                font = ImageFont.truetype(font_path, size)
            except Exception:
                continue
            for digit in "0123456789":
                templates[digit].append(render_digit_template(digit, font))

    if not any(templates.values()):
        font = ImageFont.load_default()
        for digit in "0123456789":
            templates[digit].append(render_digit_template(digit, font))

    templates["1"].extend(render_custom_one_templates())
    return {digit: tuple(values) for digit, values in templates.items()}


def render_digit_template(digit: str, font) -> object:
    image = Image.new("L", (90, 90), 255)
    draw = ImageDraw.Draw(image)
    bbox = draw.textbbox((0, 0), digit, font=font)
    draw.text(
        ((90 - (bbox[2] - bbox[0])) / 2 - bbox[0], (90 - (bbox[3] - bbox[1])) / 2 - bbox[1]),
        digit,
        font=font,
        fill=0,
    )
    return normalize_template_image(image)


def render_custom_one_templates() -> list:
    templates = []
    for stroke in (4, 5, 6, 7):
        image = Image.new("L", (90, 90), 255)
        draw = ImageDraw.Draw(image)
        draw.line((46, 18, 46, 72), fill=0, width=stroke)
        draw.line((34, 28, 46, 18), fill=0, width=stroke)
        draw.line((34, 72, 58, 72), fill=0, width=stroke)
        templates.append(normalize_template_image(image))
    return templates


def normalize_template_image(image: Image.Image):
    arr = np.array(image) < 180
    ys, xs = np.where(arr)
    if len(xs) == 0:
        return arr

    crop = image.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    scale = min((OCR_TEMPLATE_SIZE - 4) / crop.width, (OCR_TEMPLATE_SIZE - 4) / crop.height)
    resized = crop.resize(
        (max(1, int(crop.width * scale)), max(1, int(crop.height * scale))),
        Image.Resampling.BILINEAR,
    )
    canvas = Image.new("L", (OCR_TEMPLATE_SIZE, OCR_TEMPLATE_SIZE), 255)
    canvas.paste(resized, ((OCR_TEMPLATE_SIZE - resized.width) // 2, (OCR_TEMPLATE_SIZE - resized.height) // 2))
    return np.array(canvas) < 180


def build_known_digit_values(serials: list[str]) -> set[str]:
    values = set()
    for serial in serials:
        text = str(serial or "").strip()
        if text.isdigit() and 6 <= len(text) <= 12:
            values.add(text)
        values.update(DIGIT_RUN_RE.findall(text))
    return values


def correct_digit_candidate(text: str, known_values: set[str]) -> tuple[str, bool]:
    if not known_values:
        return text, False
    if text in known_values:
        return text, True

    same_length = [value for value in known_values if len(value) == len(text)]
    nearest = []
    best_distance = 99
    for value in same_length:
        distance = sum(left != right for left, right in zip(text, value))
        if distance < best_distance:
            best_distance = distance
            nearest = [value]
        elif distance == best_distance:
            nearest.append(value)

    if best_distance <= 1 and len(nearest) == 1:
        return nearest[0], True

    return text, False


@lru_cache(maxsize=1)
def load_local_known_serials() -> list[str]:
    path = ROOT / "robots_data.json"
    if not path.exists():
        return []

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []

    rows = payload if isinstance(payload, list) else payload.get("robots", [])
    return [str(row.get("serial", "")).strip() for row in rows if isinstance(row, dict) and row.get("serial")]

def main():
    host = "127.0.0.1"
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    httpd = ThreadingHTTPServer((host, port), BarcodeHandler)
    print(f"Serving ROBO::TRACK at http://{host}:{port}/robots.html")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
