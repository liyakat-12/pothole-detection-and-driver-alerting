import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

const SAMPLE_INTERVAL_MS = 700;    // how often we grab a frame (model stays loaded server-side)
const SAVE_COOLDOWN_MS = 6000;     // min gap between auto-saved detections
const FRAME_MAX_WIDTH = 800;       // frame width sent to the server

export default function LiveDetect() {
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const intervalRef = useRef(null);
    const watchIdRef = useRef(null);
    const busyRef = useRef(false);
    const lastSaveRef = useRef(0);
    const locationRef = useRef(null);

    const [streaming, setStreaming] = useState(false);
    const [location, setLocation] = useState(null);
    const [status, setStatus] = useState('idle'); // idle | starting | running | error
    const [lastResult, setLastResult] = useState(null);
    const [savedCount, setSavedCount] = useState(0);
    const [error, setError] = useState(null);

    useEffect(() => {
        return () => stopLive();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startLive = async () => {
        setError(null);
        setStatus('starting');

        if (!navigator.mediaDevices?.getUserMedia) {
            setStatus('error');
            setError('Camera not supported by this browser.');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false,
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play().catch(() => null);
            }

            // Continuous location → sent to backend with every frame
            if (navigator.geolocation) {
                watchIdRef.current = navigator.geolocation.watchPosition(
                    (pos) => {
                        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
                        locationRef.current = loc;
                        setLocation(loc);
                    },
                    (err) => { console.error('geo error', err); setError('Location unavailable — detections can\'t be saved without GPS.'); },
                    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
                );
            } else {
                setError('Geolocation not supported — detections can\'t be saved.');
            }

            setStreaming(true);
            setStatus('running');
            intervalRef.current = setInterval(captureAndSend, SAMPLE_INTERVAL_MS);
        } catch (e) {
            console.error(e);
            setStatus('error');
            setError(e.name === 'NotAllowedError' ? 'Camera permission denied.' : 'Could not start camera.');
        }
    };

    const stopLive = () => {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        if (watchIdRef.current != null && navigator.geolocation) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
        if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
        if (videoRef.current) videoRef.current.srcObject = null;
        busyRef.current = false;
        setStreaming(false);
        setStatus('idle');
    };

    const captureAndSend = async () => {
        if (busyRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || !video.videoWidth) return;

        const scale = Math.min(1, FRAME_MAX_WIDTH / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        if (!blob) return;

        const loc = locationRef.current;
        const canSave = !!loc && (Date.now() - lastSaveRef.current > SAVE_COOLDOWN_MS);

        const fd = new FormData();
        fd.append('image', blob, 'frame.jpg');
        if (loc) {
            fd.append('lat', String(loc.lat));
            fd.append('lng', String(loc.lng));
            if (loc.accuracy != null) fd.append('accuracy', String(Math.round(loc.accuracy)));
        }
        fd.append('autosave', String(canSave));

        busyRef.current = true;
        try {
            const res = await fetch(`${API_BASE}/api/pothole/live-detect`, { method: 'POST', body: fd });
            const data = await res.json().catch(() => null);
            if (res.ok && data) {
                setError(null);
                setLastResult(data);
                if (data.saved) {
                    lastSaveRef.current = Date.now();
                    setSavedCount((c) => c + 1);
                    toast.success(`Pothole saved (${(data.ai.confidence * 100).toFixed(0)}%)`);
                }
            } else {
                setError(data?.message || `Detection request failed (${res.status})`);
            }
        } catch (e) {
            setError('Cannot reach the detection server. Is the backend running?');
        } finally {
            busyRef.current = false;
        }
    };

    const detected = lastResult?.detected;
    const conf = lastResult?.ai?.confidence;

    return (
        <div className="min-h-[calc(100vh-80px)] py-12 px-4 sm:px-6">
            <div className="max-w-5xl mx-auto">
                <div className="text-center mb-8">
                    <div className="inline-block bg-[#d98c2b] text-white px-5 py-2 rounded-full text-sm font-semibold shadow-lg mb-4">
                        Live Detection
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">Real-time Pothole Detection</h1>
                    <p className="text-neutral-400 max-w-2xl mx-auto">
                        Point your camera at the road. We scan frames continuously and auto-save any detected pothole with your live GPS location.
                    </p>
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Camera */}
                    <div className="lg:col-span-2">
                        <div className="relative bg-black rounded-xl overflow-hidden border border-neutral-800 shadow-2xl">
                            <video ref={videoRef} playsInline muted className="w-full max-h-[60vh] object-contain bg-black" />
                            {/* Detection overlay banner */}
                            {streaming && (
                                <div className={`absolute top-3 left-3 px-3 py-1.5 rounded-full text-xs font-semibold ${detected ? 'bg-red-600 text-white' : 'bg-[#628141] text-white'}`}>
                                    {detected ? `⚠ Pothole detected ${conf != null ? `(${(conf * 100).toFixed(0)}%)` : ''}` : 'Scanning road...'}
                                </div>
                            )}
                            {!streaming && (
                                <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-sm">
                                    Camera is off
                                </div>
                            )}
                        </div>
                        <canvas ref={canvasRef} className="hidden" />

                        <div className="mt-4 flex gap-3">
                            {!streaming ? (
                                <button onClick={startLive} className="px-5 py-2.5 bg-[#d98c2b] hover:bg-[#bd7720] text-white rounded font-semibold">
                                    {status === 'starting' ? 'Starting...' : 'Start Live Detection'}
                                </button>
                            ) : (
                                <button onClick={stopLive} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded font-semibold">
                                    Stop
                                </button>
                            )}
                        </div>

                        {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
                    </div>

                    {/* Status panel */}
                    <div className="lg:col-span-1 space-y-4">
                        <div className="bg-neutral-900/60 rounded-xl border border-neutral-800 p-5">
                            <h3 className="text-white font-semibold mb-3">Status</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-neutral-400">Camera</span>
                                    <span className={streaming ? 'text-[#8bae66]' : 'text-neutral-500'}>{streaming ? 'Live' : 'Off'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-neutral-400">GPS</span>
                                    <span className={location ? 'text-[#8bae66]' : 'text-neutral-500'}>
                                        {location ? `±${Math.round(location.accuracy)} m` : 'Waiting...'}
                                    </span>
                                </div>
                                {location && (
                                    <div className="flex justify-between">
                                        <span className="text-neutral-400">Position</span>
                                        <span className="text-white font-mono text-xs">{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-neutral-400">Potholes saved</span>
                                    <span className="text-white font-semibold">{savedCount}</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-neutral-900/60 rounded-xl border border-neutral-800 p-5">
                            <h3 className="text-white font-semibold mb-3">Last scan</h3>
                            {lastResult ? (
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-neutral-400">Result</span>
                                        <span className={detected ? 'text-red-400 font-semibold' : 'text-neutral-300'}>
                                            {detected ? 'Pothole' : 'Clear'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-neutral-400">Confidence</span>
                                        <span className="text-white">{conf != null ? `${(conf * 100).toFixed(0)}%` : 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-neutral-400">Saved this scan</span>
                                        <span className="text-white">{lastResult.saved ? 'Yes' : 'No'}</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-neutral-500">No scans yet.</p>
                            )}
                        </div>

                        <p className="text-xs text-neutral-500">
                            Tip: live detection needs camera + location permission. On phones, use HTTPS (or localhost) so the browser allows the camera.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
