# AI-Based Pothole Detection System

A full-stack web application that detects road potholes using a fine-tuned **YOLOv8n** model. Users can report damage by uploading an image, uploading a video, or using live camera detection. Detected potholes are stored with GPS location and shown on a map and dashboard.

---

## Features

- Image report with GPS / map location  
- Video report with from→to route  
- Live camera detection with bounding-box overlay  
- Interactive map (Leaflet) and severity dashboard  
- Annotated media storage and geospatial reports  

---

## Technology Stack

| Layer | Technologies |
|-------|----------------|
| Frontend | React, Vite, Tailwind CSS, Leaflet |
| Backend | Node.js, Express, Multer, Mongoose |
| AI / ML | Python, Ultralytics YOLOv8n, OpenCV |
| Database | MongoDB (GeoJSON, 2dsphere index) |
| Media | Cloudinary |

**Model:** Pretrained `yolov8n.pt` fine-tuned on a custom pothole dataset.  
**Deployed weights:** `ai/runs/detect/train2/weights/best.pt`

**Severity mapping (backend):**  
≥ 0.8 → high · ≥ 0.5 → medium · otherwise → low  

---

## Project Structure

```
Final Project/
├── ai/                 # Model training (train.py, pothole.yaml, best.pt)
├── website/
│   ├── frontend/       # React application
│   └── backend/        # Express API + Python YOLO inference
└── docs/               # Architecture diagrams
```

---

## System Flow

```
Frontend (image / video / live + GPS)
    → Express Backend (/api/pothole)
    → ai.service.js → Python YOLO
         • Images & live → ai_server.py
         • Videos        → ai_predict.py
    → Detection result (boxes, confidence, area)
    → Severity + annotated media
    → MongoDB (metadata + GPS) + Cloudinary (media)
    → Map / Dashboard / Live overlay
```

The frontend does not call the AI model directly. The backend bridges to Python.

---

## Main API Endpoints

Base path: `/api/pothole`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List pothole reports |
| GET | `/status/:id` | Upload processing status |
| POST | `/` | Upload image or video report |
| POST | `/live-detect` | Live camera frame detection |
| POST | `/analyze` | AI analysis only |

---

## Data Storage

- **MongoDB** — location (`[lng, lat]`), severity, confidence, status, media URL  
- **Cloudinary** — annotated images and videos only  

---

## How to Run

### Prerequisites

- Node.js 18+  
- Python 3 (with packages from `website/backend/requirements.txt`)  
- MongoDB running  
- Cloudinary account  
- Trained model at `ai/runs/detect/train2/weights/best.pt`  

### 1. Backend

```bash
cd website/backend
python -m pip install -r requirements.txt
npm install
```

Create `website/backend/.env` with MongoDB, Cloudinary, and `PORT` (e.g. `8000`).

Start the backend:

```bash
npm run dev
```

Backend runs on `http://localhost:8000` (or your `PORT`).

### 2. Frontend

Open a **new terminal**:

```bash
cd website/frontend
npm install
```

Create `website/frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
```

Start the frontend:

```bash
npm run dev
```

Frontend runs on `http://localhost:5173`.

### 3. Open the app

Open **http://localhost:5173** in the browser.  
Keep both terminals running (`npm run dev` for backend and frontend).

---

## Deploy

This project needs a server that runs **Node + Python + YOLO**, plus MongoDB Atlas and Cloudinary.

Step-by-step for Render, Railway, Vercel, or Docker: see **[DEPLOY.md](DEPLOY.md)**.

Quick idea: build one Docker image (frontend + API + AI) and host it on Render/Railway with at least 2 GB RAM.

---

## License

MIT
