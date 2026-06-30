import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PYTHON_CANDIDATES = [process.env.PYTHON_EXECUTABLE, "python", "python3", "py"].filter(Boolean);

const resolvePythonExecutable = () => {
    for (const candidate of PYTHON_CANDIDATES) {
        try {
            const result = spawnSync(candidate, ["--version"], { windowsHide: true });
            const output = `${result.stdout?.toString() || ""}${result.stderr?.toString() || ""}`;
            if (result.status === 0 && /Python \d/.test(output)) {
                return candidate;
            }
        } catch {
            continue;
        }
    }
    throw new Error(
        "No Python executable found. Set PYTHON_EXECUTABLE to a valid Python interpreter with opencv-python installed."
    );
};

const PYTHON_EXECUTABLE = resolvePythonExecutable();
const AI_SCRIPT_PATH = path.resolve(__dirname, "../ai_predict.py");
const AI_SERVER_PATH = path.resolve(__dirname, "../ai_server.py");
const MODEL_PATH = path.resolve(__dirname, "../../../ai/runs/detect/train2/weights/best.pt");

const mapSeverity = (confidence) => {
    if (confidence >= 0.8) return "high";
    if (confidence >= 0.5) return "medium";
    return "low";
};

/* ----------------------------------------------------------------------------
 * Persistent YOLO server: loads the model once and answers per-image requests
 * over stdin/stdout. Used for image uploads and (especially) live frames so we
 * don't pay the model-load cost on every call.
 * ------------------------------------------------------------------------- */
let serverProc = null;
let stdoutBuffer = "";
let requestCounter = 0;
const pendingRequests = new Map();

const rejectAllPending = (err) => {
    for (const [, p] of pendingRequests) {
        clearTimeout(p.timeout);
        p.reject(err);
    }
    pendingRequests.clear();
};

const startServer = () => {
    serverProc = spawn(PYTHON_EXECUTABLE, [AI_SERVER_PATH, "--model", MODEL_PATH], { windowsHide: true });

    serverProc.stdout.on("data", (chunk) => {
        stdoutBuffer += chunk.toString();
        let newlineIdx;
        while ((newlineIdx = stdoutBuffer.indexOf("\n")) >= 0) {
            const line = stdoutBuffer.slice(0, newlineIdx).trim();
            stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);
            if (!line) continue;

            let msg;
            try {
                msg = JSON.parse(line);
            } catch {
                continue; // ignore any stray non-JSON output
            }

            const pending = pendingRequests.get(msg.id);
            if (!pending) continue;
            pendingRequests.delete(msg.id);
            clearTimeout(pending.timeout);
            if (msg.error) pending.reject(new Error(msg.error));
            else pending.resolve(msg);
        }
    });

    serverProc.stderr.on("data", () => { /* model load / warmup logs */ });

    serverProc.on("exit", () => {
        serverProc = null;
        rejectAllPending(new Error("AI server process exited"));
    });

    serverProc.on("error", () => {
        serverProc = null;
        rejectAllPending(new Error("AI server process failed to start"));
    });
};

const requestImageDetection = (inputPath, outputPath, conf) => {
    if (!serverProc) startServer();

    const id = ++requestCounter;
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            if (pendingRequests.has(id)) {
                pendingRequests.delete(id);
                reject(new Error("AI detection timed out"));
            }
        }, 30000);

        pendingRequests.set(id, { resolve, reject, timeout });

        const payload = JSON.stringify({ id, input: inputPath, output: outputPath, conf: conf ?? 0.25 }) + "\n";
        try {
            serverProc.stdin.write(payload);
        } catch (e) {
            clearTimeout(timeout);
            pendingRequests.delete(id);
            reject(e);
        }
    });
};

const runPythonDetection = async (inputPath, outputPath, conf) => {
    return new Promise((resolve, reject) => {
        const args = [AI_SCRIPT_PATH, "--model", MODEL_PATH, "--input", inputPath];
        if (outputPath) {
            args.push("--output", outputPath);
        }
        if (conf != null) {
            args.push("--conf", String(conf));
        }

        const child = spawn(PYTHON_EXECUTABLE, args, { windowsHide: true });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });

        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        child.on("error", (error) => {
            reject(new Error(`Python process failed: ${error.message}`));
        });

        child.on("close", (code) => {
            if (code !== 0) {
                const message = stderr.trim() || `Python exited with code ${code}`;
                reject(new Error(message));
            } else {
                resolve(stdout.trim());
            }
        });
    });
};

const getExtensionForMime = (mimetype = "image/jpeg") => {
    if (!mimetype.startsWith("video/")) return ".jpg";
    if (mimetype.includes("webm")) return ".webm";
    if (mimetype.includes("quicktime")) return ".mov";
    if (mimetype.includes("avi")) return ".avi";
    return ".mp4";
};

const sendToAIModel = async (buffer, mimetype = "image/jpeg", conf) => {
    const isVideo = mimetype.startsWith("video/");
    const inputExt = getExtensionForMime(mimetype);
    const outputExt = isVideo ? ".mp4" : ".jpg";
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const inputFilePath = path.join(os.tmpdir(), `pothole-in-${uniqueId}${inputExt}`);
    const outputFilePath = path.join(os.tmpdir(), `pothole-out-${uniqueId}${outputExt}`);

    await fs.writeFile(inputFilePath, buffer);

    try {
        let detections;
        if (isVideo) {
            // Videos go through the one-shot script (frame-by-frame encoding).
            const rawResult = await runPythonDetection(inputFilePath, outputFilePath, conf);
            const rawTrim = rawResult.trim();
            const jsonStart = rawTrim.indexOf("{");
            const jsonEnd = rawTrim.lastIndexOf("}");
            const jsonText = jsonStart >= 0 && jsonEnd >= 0 ? rawTrim.slice(jsonStart, jsonEnd + 1) : rawTrim;
            const parsed = JSON.parse(jsonText || "{}");
            detections = Array.isArray(parsed.detections) ? parsed.detections : [];
        } else {
            // Images/live frames use the persistent model server (fast, no reload).
            const resp = await requestImageDetection(inputFilePath, outputFilePath, conf);
            detections = Array.isArray(resp.detections) ? resp.detections : [];
        }

        const bestDetection = detections.reduce((best, current) => {
            if (!best || current.confidence > best.confidence) return current;
            return best;
        }, null);

        const confidence = bestDetection ? Number(bestDetection.confidence) : 0;
        const severity = mapSeverity(confidence);

        // Read back the annotated (marked) media so the caller can store it
        // instead of the original. If detection produced no output file, the
        // annotated buffer is null and the original media should be used.
        const annotatedBuffer = await fs.readFile(outputFilePath).catch(() => null);

        return {
            severity,
            confidence,
            detections,
            mediaType: isVideo ? "video" : "image",
            annotatedBuffer,
            annotatedMimeType: isVideo ? "video/mp4" : "image/jpeg",
        };
    } finally {
        await fs.unlink(inputFilePath).catch(() => null);
        await fs.unlink(outputFilePath).catch(() => null);
    }
};

export {
    sendToAIModel
};