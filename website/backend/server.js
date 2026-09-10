import express from "express"
import "dotenv/config"
import path from "path"
import { fileURLToPath } from "url"
import connectDB from "./config/db.config.js"
import cookieParser from "cookie-parser";
import cors from "cors"

import potholeRouter from "./routes/pothole.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 8000;

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            return callback(new Error(`Not allowed by CORS: ${origin}`));
        },
        credentials: true,
    })
);

app.use("/images", express.static("public/images"));

app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "pothole-detect" });
});

connectDB();

app.use("/api/pothole", potholeRouter);

const frontendDist = path.resolve(__dirname, "../frontend/dist");
if (process.env.SERVE_FRONTEND === "true") {
    app.use(express.static(frontendDist));
    app.use((req, res, next) => {
        if (req.method !== "GET" || req.path.startsWith("/api")) return next();
        res.sendFile(path.join(frontendDist, "index.html"), (err) => next(err));
    });
}

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
