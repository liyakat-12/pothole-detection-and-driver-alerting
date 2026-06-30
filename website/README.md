# PotholeDetect

Community-powered pothole reporting and tracking. When you open the app it shows nearby potholes on an interactive map; clicking any marker reveals its photo/video plus the AI detection confidence (accuracy) and location. You can contribute in three ways:

- **Upload a photo** — pinned to an exact spot using your GPS or by picking a point on the map.
- **Upload a video** of a road stretch — its location is set by place names (a route "from → to"), geocoded and shown on the map.
- **Live detection** — stream your camera while you travel; the AI scans frames in real time, continuously sends your location to the backend, and auto-saves each detected pothole (with the marked frame) at its GPS position.

A Python YOLO service classifies severity/confidence and draws bounding boxes on the detected potholes (on images and videos). Reports are stored in MongoDB (media on Cloudinary) and rendered on a Leaflet map.

---

## Project structure

Top-level folders:

- `backend/` — Express.js API, MongoDB models, controllers, services (AI, Cloudinary), and multer middleware for uploads.
- `frontend/` — React + Vite SPA with Tailwind and Leaflet for maps.

Key files:

- `backend/server.js` — Express server entry
- `backend/routes/pothole.routes.js` — Pothole endpoints
- `backend/controllers/pothole.controller.js` — Controller logic for upload, list, search
- `frontend/src/pages/Report.jsx` — Pothole report form (image GPS / video place-route)
- `frontend/src/pages/LiveDetect.jsx` — Live camera detection (auto-saves detections with GPS)
- `frontend/src/pages/MapView.jsx` — Map + markers + user location
- `backend/ai_predict.py` — YOLO inference; draws boxes on images/videos

API endpoints (`/api/pothole`):

- `GET /` — list reports
- `POST /` — create report (image + coordinates, or video + route)
- `POST /analyze` — AI analysis only (no save)
- `POST /live-detect` — analyze a live camera frame + GPS; auto-saves on detection
- `POST /near` — nearby reports + alerts

---

## Requirements

- Node.js 18+ (or active LTS)
- npm or yarn
- MongoDB (local or cloud)
- Cloudinary account (optional, required for image uploads)

---

## Environment variables

Create `.env` files in each package as needed.

### Backend (`backend/.env`)

Required:

- `MONGO_DB_URL` — MongoDB connection string (e.g. `mongodb://localhost:27017`)
- `DB_NAME` — Database name
- `PORT` — Port for backend server (default: `3000`)
- `CLOUDINARY_CLOUD_NAME` — Cloudinary cloud name (if using Cloudinary)
- `CLOUDINARY_API_KEY` — Cloudinary API key
- `CLOUDINARY_API_SECRET` — Cloudinary API secret
- `CORS_ORIGIN` — Frontend origin (optional, defaults to http://localhost:5173)

### Frontend (`frontend/.env`)

Required:

- `VITE_API_URL` — `http://localhost:8000`


> Note: When using the Geolocation API in the browser, geolocation usually requires HTTPS (except on `localhost`). Run the frontend on `localhost` for development to access GPS features.

---

## Setup & local development

Clone the repo and install dependencies for both services.

1. Backend

```bash
cd backend
npm install
# create .env with MONGO_URI etc.
npm run dev   # or `node server.js` if you prefer
```

- Backend will start on `PORT` (default `3000`) and expose endpoints under `/api/pothole`.

2. Frontend

```bash
cd frontend
npm install
# optional: set VITE_API_URL in `frontend/.env` if not using a Vite proxy
npm run dev
```

- Vite dev server runs by default on `http://localhost:5173`.
- If you prefer proxying, add the `server.proxy` entry to `vite.config.js`:

```js
// vite.config.js
export default defineConfig({
  // ...
  server: {
    proxy: {
      '/api': 'http://localhost:8000'
    }
  }
})
```

---

## API

Base: `http://localhost:8000/api/pothole`

### GET /

Fetch recent potholes. Query params (optional): `lat`, `lng` (to filter by 20km radius), `radius` for custom distances on `/near` endpoint.

Response example:

```json
{
  "count": 10,
  "potholes": [
    {
      "_id": "...",
      "location": { "type": "Point", "coordinates": [lng, lat] },
      "severity": "high",
      "confidence": 0.92,
      "imageURL": "https://...",
      "createdAt": "2026-01-10T..."
    }
  ]
}
```

### POST /

Upload pothole report. Form data fields:

- `image` — image file (multipart)
- `locationDetails` — JSON string of `[latitude, longitude]` (note: backend expects `coordinates: [longitude, latitude]` internally)

Returns 201 with created pothole object on success.

### POST /near

Accepts `lat`, `lng`, and optional `radius` (meters) — returns nearby potholes and alerts

---

## Features

- Report potholes by uploading image, vedio and strem vedio + location
- Dashboard with counts by severity
- Interactive map (Leaflet + OpenStreetMap) with markers for reports
- User location marker and nearby detection (within 200m flagged)
- Cloudinary image uploads (optional)

---

## License

MIT

