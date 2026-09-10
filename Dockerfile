# Build frontend, then run Express + Python YOLO in one service.
FROM node:20-bookworm AS frontend
WORKDIR /app/website/frontend
COPY website/frontend/package.json website/frontend/package-lock.json ./
RUN npm ci
COPY website/frontend ./
# Same-origin API calls when Express serves this build
ENV VITE_API_URL=
RUN npm run build

FROM node:20-bookworm
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY website/backend ./website/backend
COPY --from=frontend /app/website/frontend/dist ./website/frontend/dist
COPY ai/runs/detect/train2/weights/best.pt ./ai/runs/detect/train2/weights/best.pt

WORKDIR /app/website/backend
RUN npm ci --omit=dev
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

ENV NODE_ENV=production
ENV SERVE_FRONTEND=true
ENV PYTHON_EXECUTABLE=/opt/venv/bin/python
ENV PORT=8000

EXPOSE 8000
CMD ["node", "server.js"]
