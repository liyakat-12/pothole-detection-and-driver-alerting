# Deploy (free options)

## Honest answer

**There is no good, fully free host that can reliably run this whole app.**

Why: YOLOv8 + PyTorch needs about **2–4 GB RAM**.  
Typical free plans give **512 MB**. The AI process is usually killed.

| Part | Free forever? | Where |
|------|----------------|--------|
| Frontend (React) | Yes | Vercel |
| Database | Yes | MongoDB Atlas |
| Images/videos | Yes | Cloudinary (you already have this) |
| Backend + YOLO AI | **Usually no** | Needs ~2 GB RAM |

---

## What I recommend (student / final-year)

### Best *free* combo that actually works for the UI

1. **MongoDB Atlas** — free  
2. **Cloudinary** — free  
3. **Vercel** — free frontend  
4. **Render Starter (~$7/month)** — backend + AI  

If you **must pay $0**, try **Render Free** below.  
Expect the first AI request to crash with “out of memory”. Then upgrade that one service.

---

## Step 1 — MongoDB Atlas (free)

1. Sign up: https://www.mongodb.com/atlas  
2. Create a **free M0** cluster.  
3. **Database Access** → create a user.  
4. **Network Access** → Add IP → `0.0.0.0/0`.  
5. **Connect** → copy URI, like:

```text
mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/potholedb
```

---

## Step 2 — Try Render Free (backend + AI)

This is the only common **ongoing free** web host for Node + Docker.

1. Push this project to GitHub (include `ai/runs/detect/train2/weights/best.pt`).  
2. Go to https://render.com → sign up with GitHub.  
3. **New +** → **Web Service** → your repo.  
4. Settings:

| Setting | Value |
|---------|--------|
| Language | Docker |
| Dockerfile path | `Dockerfile` |
| Instance | **Free** |

5. Environment variables:

```env
MONGO_DB_URL=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/potholedb
DB_NAME=potholedb
PORT=8000
CLOUDINARY_CLOUD_NAME=your_cloud
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret
CORS_ORIGIN=*
SERVE_FRONTEND=true
PYTHON_EXECUTABLE=/opt/venv/bin/python
```

6. Click **Deploy**. First build can take 15–25 minutes.

**If it works:** your app URL is `https://something.onrender.com`  
**If it dies / “OOM” / “Killed”:** Free 512 MB is not enough. Upgrade that Web Service to **Starter (2 GB)**.

Free Render also **sleeps after 15 minutes**. First visit can take ~1 minute to wake.

---

## Step 3 — Optional: free frontend on Vercel

Only needed if you want a nicer frontend URL. The Docker setup already serves the website from Render.

1. https://vercel.com → Import GitHub repo  
2. Root directory: `website/frontend`  
3. Environment variable:

```env
VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com
```

4. Deploy  

Then set Render `CORS_ORIGIN` to your Vercel URL (or keep `*`).

---

## What is NOT free enough

| Host | Why not |
|------|---------|
| Vercel / Netlify alone | Cannot run Python YOLO |
| Railway | Trial credits only, then paid |
| Hugging Face Docker Spaces | Docker Spaces now need a paid plan |

---

## After deploy, test

- `https://YOUR-URL/health` → `{ "ok": true }`  
- Open Home, Map, Dashboard  
- Upload one small image on Report  

Live camera needs **HTTPS** (Render/Vercel already have it).

---

I cannot click Deploy for you (needs your GitHub + Render login).  
Do **Step 1 + Step 2**. If the Render log shows an error, paste it here and I will fix it.
