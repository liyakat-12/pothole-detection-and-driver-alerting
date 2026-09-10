# PotholeDetect (Website)

React frontend + Express backend for the AI-Based Pothole Detection System.

For the full project (including model training under `ai/`), see the root [`README.md`](../README.md).

---

## What this app does

- **Report** — upload image (GPS/map) or video (from→to route)
- **Live** — webcam detection with overlay; autosave when confidence is high enough
- **Map** — Leaflet markers + nearby highlight (~500 m)
- **Dashboard** — severity / source stats

AI runs on the backend via Python YOLOv8 (`best.pt`). Media goes to Cloudinary; metadata + GPS go to MongoDB.

---

## Structure

```
website/
├── frontend/     # React + Vite + Tailwind + Leaflet
└── backend/      # Express API + ai.service.js + ai_server.py + ai_predict.py
```

### Important backend files

| File | Role |
|------|------|
| `backend/server.js` | Express entry, CORS, routes |
| `backend/routes/pothole.routes.js` | `/api/pothole` endpoints |
| `backend/controllers/pothole.controller.js` | Upload, live, list, status |
| `backend/services/ai.service.js` | Spawns Python; maps confidence → severity |
| `backend/ai_server.py` | Persistent YOLO for images/live |
| `backend/ai_predict.py` | One-shot YOLO for videos |
| `backend/models/pothole.model.js` | MongoDB schema (GeoJSON + 2dsphere) |

### Important frontend pages

| File | Role |
|------|------|
| `frontend/src/pages/Report.jsx` | Upload + status polling |
| `frontend/src/pages/LiveDetect.jsx` | Live camera + overlay |
| `frontend/src/pages/MapView.jsx` | Map + nearby highlight |
| `frontend/src/pages/Dashboard.jsx` | Stats |

---

## Requirements

- Node.js 18+
- Python 3 + `backend/requirements.txt` (`ultralytics`, `opencv-python`, `numpy`, `torch`)
- MongoDB
- Cloudinary
- Model weights: `../../ai/runs/detect/train2/weights/best.pt` (from `website/backend`)

---

## Environment

### `backend/.env`

```env
MONGO_DB_URL=mongodb://localhost:27017
DB_NAME=your_db_name
PORT=8000
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CORS_ORIGIN=http://localhost:5173
PYTHON_EXECUTABLE=python
```

### `frontend/.env`

```env
VITE_API_URL=http://localhost:8000
```

---

## Run locally

```bash
# Python deps (once)
cd backend
python -m pip install -r requirements.txt
npm install
npm run dev

# new terminal
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:5173  
- Backend: http://localhost:8000  

---

## API (`/api/pothole`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List potholes (optional `lat`, `lng`) |
| `GET` | `/status/:id` | Poll processing status after upload |
| `POST` | `/` | Upload image/video → **202** `{ id, status: "processing" }` |
| `POST` | `/analyze` | AI only |
| `POST` | `/live-detect` | Live frame + GPS |
| `POST` | `/near` | Nearby query (backend); map nearby is mainly client-side |

### Image upload FormData

- `image`
- `locationDetails` — JSON `[lat, lng]`
- optional `accuracy`

### Video upload FormData

- `video`
- `route` — JSON `{ fromName, toName, from:{lat,lng}, to:{lat,lng} }`

---

## AI notes

- Frontend never calls YOLO directly.
- Images/live → persistent `ai_server.py`
- Videos → one-shot `ai_predict.py`
- Severity is computed in **`ai.service.js`** from confidence (≥0.8 high, ≥0.5 medium, else low)

More detail: [`../docs/TECHNICAL_README.md`](../docs/TECHNICAL_README.md)

---

## License

MIT
