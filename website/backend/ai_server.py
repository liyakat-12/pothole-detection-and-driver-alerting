"""Long-running YOLO detection server.

Loads the model ONCE and then processes one request per line of stdin, writing
one JSON response line per request to stdout. This makes per-frame live
detection fast (no model reload each call).

Request  (stdin, one JSON per line):  {"id": 1, "input": "...jpg", "output": "...jpg", "conf": 0.2}
Response (stdout, one JSON per line):  {"id": 1, "detections": [...], "mediaType": "image"}
                                       {"id": 1, "error": "..."}
"""

import argparse
import json
import sys
from pathlib import Path

import cv2
from ultralytics import YOLO

from ai_predict import detections_from_result, draw_boxes, downscale


def parse_args():
    parser = argparse.ArgumentParser(description="Persistent YOLO detection server.")
    parser.add_argument("--model", required=True, help="Path to the YOLO model weights")
    parser.add_argument("--conf", type=float, default=0.25, help="Default confidence threshold")
    return parser.parse_args()


def handle_request(model, req):
    rid = req.get("id")
    input_path = Path(req["input"])
    output_path = req.get("output")
    conf = float(req.get("conf", 0.25))

    image = cv2.imread(str(input_path))
    if image is None:
        raise ValueError(f"Could not read image: {input_path}")

    image = downscale(image)
    results = model(image, conf=conf, verbose=False)

    detections = []
    for r in results:
        detections.extend(detections_from_result(r, model))

    if output_path:
        annotated = draw_boxes(image.copy(), detections)
        cv2.imwrite(str(output_path), annotated)

    return {"id": rid, "detections": detections, "mediaType": "image"}


def main():
    args = parse_args()
    model = YOLO(str(args.model))

    # Warm up so the first real request is fast too.
    try:
        import numpy as np
        model(np.zeros((32, 32, 3), dtype="uint8"), verbose=False)
    except Exception:
        pass

    # Tell the parent we're ready (on stderr so it doesn't pollute responses).
    sys.stderr.write("AI_SERVER_READY\n")
    sys.stderr.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception:
            continue

        try:
            response = handle_request(model, req)
        except Exception as e:  # noqa: BLE001 - report any failure back to the caller
            response = {"id": req.get("id"), "error": str(e)}

        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
