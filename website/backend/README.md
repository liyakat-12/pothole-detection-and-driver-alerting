# Backend AI Integration

Express backend for pothole uploads, live frames, and YOLOv8 inference.

## What it does

1. Receives image/video/live frames from the frontend (`/api/pothole`)
2. Runs detection via Python (`ai.service.js` → `ai_server.py` / `ai_predict.py`)
3. Maps confidence → severity in **`ai.service.js`** (not in Python)
4. Stores annotated media on Cloudinary and metadata + GPS in MongoDB

## Setup

```bash
cd website/backend
npm install
python -m pip install -r requirements.txt
```

Ensure trained weights exist at:

```text
ai/runs/detect/train2/weights/best.pt
```

(relative to repo root; resolved from `services/ai.service.js`)

Create `.env` (see root or `website/README.md`), then:

```bash
npm run dev
```

## AI processes

| Script | Used for | Behavior |
|--------|----------|----------|
| `ai_server.py` | Images + live frames | Persistent process; model loaded once; JSON over stdin/stdout |
| `ai_predict.py` | Videos | One-shot process per upload |

Optional: set `PYTHON_EXECUTABLE` in `.env` if `python` is not on PATH.

## Severity thresholds

| Confidence | Severity |
|------------|----------|
| ≥ 0.8 | high |
| ≥ 0.5 | medium |
| &lt; 0.5 | low |

## Frontend

```bash
cd website/frontend
npm install
npm run dev
```

Set `VITE_API_URL` to your backend URL (e.g. `http://localhost:8000`).
