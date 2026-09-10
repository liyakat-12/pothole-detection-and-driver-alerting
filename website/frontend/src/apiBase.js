// If VITE_API_URL is unset, use local backend.
// If it is set to "" (Docker / same-origin), call /api on the same host.
const raw = import.meta.env.VITE_API_URL;
export const API_BASE = raw === undefined ? "http://localhost:8000" : raw;
