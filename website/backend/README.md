# Backend AI Integration

This backend is configured to receive pothole image uploads from the frontend, run the trained YOLO model, and store the prediction result along with the image in Cloudinary and MongoDB.

## Setup

1. Install Node dependencies:

```bash
cd website/backend
npm install
```

2. Install Python dependencies:

```bash
cd website/backend
python -m pip install -r requirements.txt
```

3. Make sure the trained model file exists at `../../ai/runs/detect/train2/weights/best.pt` relative to `website/backend`.

4. Start the backend:

```bash
npm run dev
```

## Frontend

From `website/frontend`:

```bash
npm install
npm run dev
```

## Notes

- The backend uses `PYTHON_EXECUTABLE` environment variable if provided. Otherwise it falls back to `python`.
- The frontend posts image uploads to `/api/pothole`, which now runs the AI model before saving the record.
