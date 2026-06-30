import argparse
import json
import sys
from pathlib import Path

import cv2
from ultralytics import YOLO


VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"}

# We write back EVERY source frame so the annotated video plays smoothly (no
# dropped/lost frames). To keep it fast, the model only runs every Nth frame
# (DETECTION_SAMPLE_FPS) and the last known boxes are kept on the frames in
# between. Downscaling each frame is the main speed win.
DETECTION_SAMPLE_FPS = 4

# Largest dimension (width or height) used for inference/output. Downscaling
# big phone videos here is the single biggest speed/encoding win.
MAX_DIM = 640

# Safety cap on total frames written (~90s at 30fps) so a huge upload can't
# blow up processing time or output size.
MAX_TOTAL_FRAMES = 2700


def parse_args():
    parser = argparse.ArgumentParser(description="Run YOLO prediction on an image or video and output JSON.")
    parser.add_argument("--model", required=True, help="Path to the YOLO model weights")
    parser.add_argument("--input", required=True, help="Path to the input image/video file")
    parser.add_argument("--output", required=False, help="Path to write the annotated image/video")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    return parser.parse_args()


def detections_from_result(result, model):
    detections = []
    for box in result.boxes:
        xyxy = box.xyxy[0].tolist()
        x1, y1, x2, y2 = map(int, xyxy)
        confidence = float(box.conf[0])
        cls_id = int(box.cls[0])
        class_name = model.names.get(cls_id, str(cls_id))
        detections.append(
            {
                "class_id": cls_id,
                "class_name": class_name,
                "confidence": confidence,
                "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
            }
        )
    return detections


def draw_boxes(frame, detections):
    for d in detections:
        b = d["bbox"]
        cv2.rectangle(frame, (b["x1"], b["y1"]), (b["x2"], b["y2"]), (0, 0, 255), 2)
        label = f'{d["class_name"]} {d["confidence"] * 100:.0f}%'
        y_text = max(0, b["y1"] - 8)
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        cv2.rectangle(frame, (b["x1"], y_text - th - 4), (b["x1"] + tw, y_text + 2), (0, 0, 255), -1)
        cv2.putText(frame, label, (b["x1"], y_text), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    return frame


def downscale(frame):
    h, w = frame.shape[:2]
    longest = max(h, w)
    if longest > MAX_DIM:
        scale = MAX_DIM / longest
        frame = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return frame


def run_inference(model, frame, conf):
    results = model(frame, conf=conf, verbose=False)
    detections = []
    for r in results:
        detections.extend(detections_from_result(r, model))
    return detections


def process_image(model, input_path, output_path, conf):
    image = cv2.imread(str(input_path))
    if image is None:
        raise ValueError(f"Could not read image: {input_path}")

    detections = run_inference(model, image, conf)

    if output_path:
        annotated = draw_boxes(image.copy(), detections)
        cv2.imwrite(str(output_path), annotated)

    return detections


def process_video(model, input_path, output_path, conf):
    cap = cv2.VideoCapture(str(input_path))
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {input_path}")

    src_fps = cap.get(cv2.CAP_PROP_FPS)
    if not src_fps or src_fps <= 0:
        src_fps = 25.0

    # Run the model only every `det_stride`-th frame, but write EVERY frame so the
    # output video stays smooth and keeps the original playback speed.
    det_stride = max(1, round(src_fps / DETECTION_SAMPLE_FPS))

    writer = None
    all_detections = []
    last_detections = []
    frame_idx = 0

    while frame_idx < MAX_TOTAL_FRAMES:
        ret, frame = cap.read()
        if not ret:
            break

        frame = downscale(frame)

        if frame_idx % det_stride == 0:
            last_detections = run_inference(model, frame, conf)
            for d in last_detections:
                tagged = dict(d)
                tagged["frame"] = frame_idx
                all_detections.append(tagged)

        if output_path:
            annotated = draw_boxes(frame.copy(), last_detections)
            if writer is None:
                h, w = annotated.shape[:2]
                fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                writer = cv2.VideoWriter(str(output_path), fourcc, src_fps, (w, h))
            writer.write(annotated)

        frame_idx += 1

    cap.release()
    if writer is not None:
        writer.release()

    return all_detections


def main():
    args = parse_args()
    model_path = Path(args.model)
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")

    input_path = Path(args.input)
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    model = YOLO(str(model_path))

    is_video = input_path.suffix.lower() in VIDEO_EXTENSIONS
    if is_video:
        detections = process_video(model, input_path, args.output, args.conf)
    else:
        detections = process_image(model, input_path, args.output, args.conf)

    output = {"detections": detections, "mediaType": "video" if is_video else "image"}
    sys.stdout.write(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
