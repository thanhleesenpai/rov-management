from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
from ultralytics import YOLO
import requests
import tempfile
import os
import cv2
from pathlib import Path

app = FastAPI(title="YOLOv8 Detection Service")

BASE_DIR = Path(__file__).parent

MODEL_META = {
    "yolov8n":          {"label": "YOLOv8n General",        "speed": "fast", "warning": None},
    "fish1":            {"label": "Fish Detector v1",        "speed": "fast", "warning": None},
    "fish2":            {"label": "Fish Detector v2",        "speed": "fast", "warning": None},
    "trash":            {"label": "Trash Detector",          "speed": "fast", "warning": None},
    "f4k_single_m":     {"label": "Fish Detector M (f4k)",  "speed": "slow", "warning": "YOLOv8m — 2-3× slower on CPU"},
    "deepfish_multi_m": {"label": "DeepFish Multi M",       "speed": "slow", "warning": "YOLOv8m — 2-3× slower on CPU"},
}

_model_cache: dict[str, YOLO] = {}

def get_model(name: str) -> YOLO:
    if name not in _model_cache:
        pt_path = BASE_DIR / f"{name}.pt"
        if not pt_path.exists():
            raise HTTPException(status_code=404, detail=f"Model file '{name}.pt' not found in {BASE_DIR}")
        _model_cache[name] = YOLO(str(pt_path))
    return _model_cache[name]

get_model("yolov8n")


class DetectRequest(BaseModel):
    mediaUrl: str
    mediaType: str = "image/jpeg"
    confidence: float = 0.3
    model: str = "yolov8n"
    startTime: Optional[float] = None
    endTime: Optional[float] = None


@app.get("/health")
def health():
    available = sorted(p.stem for p in BASE_DIR.glob("*.pt"))
    return {"status": "ok", "models": available}


@app.get("/models")
def list_models():
    models = []
    for p in sorted(BASE_DIR.glob("*.pt")):
        name = p.stem
        meta = MODEL_META.get(name, {"label": name, "speed": "unknown", "warning": None})
        models.append({"name": name, **meta})
    return {"models": models}


@app.post("/detect")
def detect(req: DetectRequest):
    m = get_model(req.model)

    try:
        r = requests.get(req.mediaUrl, timeout=60)
        r.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to download media: {e}")

    is_video = req.mediaType.startswith("video/")
    suffix = ".mp4" if is_video else ".jpg"

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(r.content)
            tmp_path = f.name

        if is_video:
            labels = _detect_video(tmp_path, m, req.confidence, req.startTime, req.endTime)
        else:
            labels = _detect_image(tmp_path, m, req.confidence)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    return labels


def _detect_image(path: str, m: YOLO, conf: float = 0.3):
    results = m.predict(path, verbose=False, conf=conf, iou=0.3)
    detections: dict = {}
    for r in results:
        if not r.boxes:
            continue
        h, w = r.orig_shape[:2]
        for box in r.boxes:
            name = m.names[int(box.cls)]
            box_conf = float(box.conf)
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
            if name not in detections or box_conf > detections[name]["confidence"]:
                detections[name] = {
                    "name": name,
                    "confidence": round(box_conf, 3),
                    "bbox": {
                        "x1": round(x1 / w, 4),
                        "y1": round(y1 / h, 4),
                        "x2": round(x2 / w, 4),
                        "y2": round(y2 / h, 4),
                    },
                }
    raw = sorted(detections.values(), key=lambda x: -x["confidence"])[:20]
    return _cross_class_nms(raw)


def _iou(a: dict, b: dict) -> float:
    ix1 = max(a["x1"], b["x1"]); iy1 = max(a["y1"], b["y1"])
    ix2 = min(a["x2"], b["x2"]); iy2 = min(a["y2"], b["y2"])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    aa = (a["x2"] - a["x1"]) * (a["y2"] - a["y1"])
    ab = (b["x2"] - b["x1"]) * (b["y2"] - b["y1"])
    union = aa + ab - inter
    return inter / union if union > 1e-6 else 0.0


def _cross_class_nms(dets: list, iou_thresh: float = 0.3) -> list:
    """Remove lower-confidence detections that overlap significantly with a higher-confidence one,
    even across different classes."""
    dets = sorted(dets, key=lambda x: -x["confidence"])
    keep = []
    for d in dets:
        bbox = d.get("bbox")
        if bbox and any(_iou(bbox, k["bbox"]) > iou_thresh for k in keep if k.get("bbox")):
            continue
        keep.append(d)
    return keep


def _pick_interval(duration_sec: float) -> float:
    if duration_sec < 30:
        return 0.2
    if duration_sec < 180:
        return 0.5
    return 1.0


def _detect_video(
    path: str,
    m: YOLO,
    conf: float = 0.3,
    start_time: Optional[float] = None,
    end_time: Optional[float] = None,
):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps

    # Adaptive interval: based on the segment being processed
    seg_duration = (end_time or duration) - (start_time or 0)
    sample_interval = _pick_interval(seg_duration)
    frame_interval = max(1, round(fps * sample_interval))

    # Seek to start_time if a range is given
    start_frame = 0
    if start_time is not None:
        start_frame = max(0, int(start_time * fps))
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    detections: list = []
    frame_idx = start_frame
    is_first = True

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        current_sec = frame_idx / fps
        if end_time is not None and current_sec > end_time:
            break

        if (frame_idx - start_frame) % frame_interval == 0:
            # persist=False on first frame resets tracker state (no cross-video leakage)
            results = m.track(
                frame, verbose=False, conf=conf, iou=0.3,
                persist=not is_first, tracker="bytetrack.yaml",
            )
            is_first = False
            frame_dets = []
            for r in results:
                if not r.boxes:
                    continue
                h, w = r.orig_shape[:2]
                for box in r.boxes:
                    name = m.names[int(box.cls)]
                    box_conf = float(box.conf)
                    x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
                    track_id = int(box.id[0]) if box.id is not None else None
                    frame_dets.append({
                        "name": name,
                        "confidence": round(box_conf, 3),
                        "frameTime": round(current_sec, 2),
                        "trackId": track_id,
                        "bbox": {
                            "x1": round(x1 / w, 4),
                            "y1": round(y1 / h, 4),
                            "x2": round(x2 / w, 4),
                            "y2": round(y2 / h, 4),
                        },
                    })
            detections.extend(_cross_class_nms(frame_dets))

        frame_idx += 1

    cap.release()
    return detections
