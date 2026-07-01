import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function Report() {
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

    const [mediaType, setMediaType] = useState('image');
    const [mediaFile, setMediaFile] = useState(null);
    const [preview, setPreview] = useState(null);

    // Image location (coordinates / GPS)
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [accuracy, setAccuracy] = useState(null);
    const [locating, setLocating] = useState(false);
    const [locationError, setLocationError] = useState(null);
    const locatingIdRef = useRef(0);

    // Image map picker
    const [pickOnMap, setPickOnMap] = useState(false);
    const [pickerCoords, setPickerCoords] = useState({ lat: null, lng: null });
    const pickerContainerRef = useRef(null);

    // Video location (place based: from -> to)
    const [fromQuery, setFromQuery] = useState('');
    const [toQuery, setToQuery] = useState('');
    const [fromResults, setFromResults] = useState([]);
    const [toResults, setToResults] = useState([]);
    const [fromPlace, setFromPlace] = useState(null); // { name, lat, lng }
    const [toPlace, setToPlace] = useState(null);
    const [searching, setSearching] = useState({ from: false, to: false });
    const routeMapContainerRef = useRef(null);
    const routeMapRef = useRef(null);
    const routeLayerRef = useRef(null);

    // Upload / processing
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [processing, setProcessing] = useState(false);
    const [aiResult, setAiResult] = useState(null);
    const [submitted, setSubmitted] = useState(null); // { mediaType } after a successful upload

    const navigate = useNavigate();

    useEffect(() => {
        return () => {
            if (preview) URL.revokeObjectURL(preview);
        };
    }, [preview]);

    // Poll the report's processing status so the confirmation screen reflects
    // when analysis actually finishes (or fails), instead of guessing.
    useEffect(() => {
        if (!submitted?.id || submitted.status !== 'processing') return;
        let cancelled = false;
        let timer;
        let attempts = 0;
        const maxAttempts = 150; // ~7.5 min at 3s (videos can take a while)

        const poll = async () => {
            if (cancelled) return;
            attempts += 1;
            try {
                const res = await fetch(`${API_BASE}/api/pothole/status/${submitted.id}`);
                if (res.ok) {
                    const s = await res.json();
                    if (!cancelled && (s.status === 'done' || s.status === 'failed')) {
                        setSubmitted((prev) => (prev ? { ...prev, status: s.status, error: s.error, severity: s.severity, confidence: s.confidence } : prev));
                        return;
                    }
                }
            } catch {
                /* transient network error — keep polling */
            }
            if (cancelled) return;
            if (attempts >= maxAttempts) {
                setSubmitted((prev) => (prev ? { ...prev, status: 'timeout' } : prev));
                return;
            }
            timer = setTimeout(poll, 3000);
        };

        timer = setTimeout(poll, 2500);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [submitted?.id, submitted?.status, API_BASE]);

    const handleMediaTypeChange = (type) => {
        if (preview) URL.revokeObjectURL(preview);
        setMediaType(type);
        setMediaFile(null);
        setPreview(null);
        setAiResult(null);
    };

    const handleMediaChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');

        if (mediaType === 'image' && !isImage) return toast.error('Please select an image file');
        if (mediaType === 'video' && !isVideo) return toast.error('Please select a video file');

        const maxSize = mediaType === 'video' ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
        if (file.size > maxSize) {
            return toast.error(mediaType === 'video' ? 'Video must be less than 50MB' : 'Image must be less than 5MB');
        }

        setMediaFile(file);
        setPreview(URL.createObjectURL(file));
    };

    /* ---------------- Image: GPS location ---------------- */

    const handleUseMyLocation = async () => {
        setLocationError(null);
        if (!navigator.geolocation) {
            setLocationError('Geolocation not supported by your browser');
            return toast.error('Geolocation not supported by your browser');
        }
        if (window.location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
            const msg = 'Geolocation requires a secure (HTTPS) connection';
            setLocationError(msg);
            return toast.error(msg);
        }

        const id = ++locatingIdRef.current;
        setLocating(true);
        try {
            const getPosition = (options) => new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
            try {
                const pos = await getPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
                if (id === locatingIdRef.current) applyPosition(pos);
            } catch (err) {
                if (err && err.code === 1) {
                    const msg = 'Location permission denied';
                    setLocationError(msg);
                    return toast.error(msg);
                }
                const pos = await getPosition({ enableHighAccuracy: false, timeout: 5000, maximumAge: 0 });
                if (id === locatingIdRef.current) {
                    applyPosition(pos);
                    toast('Using coarse location (lower accuracy).');
                }
            }
        } catch (err2) {
            const msg = 'Failed to get location: ' + (err2.message || 'unknown error');
            setLocationError(msg);
            toast.error(msg);
        } finally {
            if (id === locatingIdRef.current) setLocating(false);
        }
    };

    const applyPosition = (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy;
        setLatitude(lat.toFixed(6));
        setLongitude(lng.toFixed(6));
        setAccuracy(acc);
        if (acc && acc > 1000) {
            const msg = `Low location accuracy: ${Math.round(acc)} m. Try again or enter location manually.`;
            setLocationError(msg);
            toast.error(msg);
        } else {
            setLocationError(null);
            toast.success(`Location captured (accuracy ${Math.round(acc || 0)} m)`);
        }
    };

    // Image map picker modal
    useEffect(() => {
        if (!pickOnMap || !pickerContainerRef.current) return;
        const initialLat = latitude ? Number(latitude) : 20;
        const initialLng = longitude ? Number(longitude) : 0;
        const map = L.map(pickerContainerRef.current, { center: [initialLat, initialLng], zoom: latitude ? 14 : 2 });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        let marker = null;
        const onClick = (e) => {
            const { lat, lng } = e.latlng;
            setPickerCoords({ lat, lng });
            if (marker) marker.setLatLng(e.latlng);
            else marker = L.circleMarker(e.latlng, { radius: 8, color: '#628141', fillColor: '#628141', fillOpacity: 0.9 }).addTo(map);
        };
        map.on('click', onClick);
        if (pickerCoords.lat && pickerCoords.lng) {
            marker = L.circleMarker([pickerCoords.lat, pickerCoords.lng], { radius: 8, color: '#628141', fillColor: '#628141', fillOpacity: 0.9 }).addTo(map);
            map.setView([pickerCoords.lat, pickerCoords.lng], 14);
        }
        setTimeout(() => map.invalidateSize(), 100);
        return () => { map.off('click', onClick); try { map.remove(); } catch (e) { /* ignore */ } };
    }, [pickOnMap]);

    const confirmPickerSelection = () => {
        if (!pickerCoords.lat || !pickerCoords.lng) return toast.error('Please click on the map to select a location');
        setLatitude(pickerCoords.lat.toFixed(6));
        setLongitude(pickerCoords.lng.toFixed(6));
        setAccuracy(null);
        setPickOnMap(false);
        toast.success('Location selected');
    };

    /* ---------------- Video: place-based location ---------------- */

    const geocode = async (query, which) => {
        if (!query.trim()) return;
        setSearching((s) => ({ ...s, [which]: true }));
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`,
                { headers: { Accept: 'application/json' } }
            );
            const data = await res.json();
            const places = (data || []).map((d) => ({
                name: d.display_name,
                lat: Number(d.lat),
                lng: Number(d.lon),
            }));
            if (which === 'from') setFromResults(places);
            else setToResults(places);
            if (places.length === 0) toast('No matching place found.');
        } catch (e) {
            toast.error('Place search failed. Try again.');
        } finally {
            setSearching((s) => ({ ...s, [which]: false }));
        }
    };

    const selectPlace = (place, which) => {
        if (which === 'from') {
            setFromPlace(place);
            setFromQuery(place.name);
            setFromResults([]);
        } else {
            setToPlace(place);
            setToQuery(place.name);
            setToResults([]);
        }
    };

    // Init route map for video mode
    useEffect(() => {
        if (mediaType !== 'video' || !routeMapContainerRef.current) return;
        const map = L.map(routeMapContainerRef.current, { center: [20, 78], zoom: 4 });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);
        routeLayerRef.current = L.layerGroup().addTo(map);
        routeMapRef.current = map;
        setTimeout(() => map.invalidateSize(), 100);
        return () => {
            try { map.remove(); } catch (e) { /* ignore */ }
            routeMapRef.current = null;
            routeLayerRef.current = null;
        };
    }, [mediaType]);

    // Draw from/to markers + line on the route map
    useEffect(() => {
        const map = routeMapRef.current;
        const layer = routeLayerRef.current;
        if (!map || !layer) return;
        layer.clearLayers();

        const pts = [];
        if (fromPlace) {
            L.circleMarker([fromPlace.lat, fromPlace.lng], { radius: 9, color: '#fff', weight: 2, fillColor: '#628141', fillOpacity: 1 })
                .bindPopup('From: ' + fromPlace.name).addTo(layer);
            pts.push([fromPlace.lat, fromPlace.lng]);
        }
        if (toPlace) {
            L.circleMarker([toPlace.lat, toPlace.lng], { radius: 9, color: '#fff', weight: 2, fillColor: '#d98c2b', fillOpacity: 1 })
                .bindPopup('To: ' + toPlace.name).addTo(layer);
            pts.push([toPlace.lat, toPlace.lng]);
        }
        if (fromPlace && toPlace) {
            L.polyline([[fromPlace.lat, fromPlace.lng], [toPlace.lat, toPlace.lng]], { color: '#628141', weight: 3, dashArray: '6 6' }).addTo(layer);
        }
        if (pts.length === 1) map.flyTo(pts[0], 13, { duration: 0.6 });
        else if (pts.length === 2) map.fitBounds(L.latLngBounds(pts).pad(0.3));
    }, [fromPlace, toPlace]);

    /* ---------------- Submit ---------------- */

    const resetForm = () => {
        handleMediaTypeChange('image');
        setLatitude(''); setLongitude(''); setAccuracy(null); setLocationError(null);
        setFromQuery(''); setToQuery(''); setFromResults([]); setToResults([]);
        setFromPlace(null); setToPlace(null);
    };

    const handleReportAnother = () => {
        setSubmitted(null);
        setAiResult(null);
        resetForm();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!mediaFile) return toast.error(`${mediaType === 'video' ? 'Video' : 'Image'} is required`);

        const fd = new FormData();
        if (mediaType === 'video') {
            if (!fromPlace || !toPlace) return toast.error('Please select both "from" and "to" places for the video');
            fd.append('video', mediaFile);
            fd.append('route', JSON.stringify({
                fromName: fromPlace.name,
                toName: toPlace.name,
                from: { lat: fromPlace.lat, lng: fromPlace.lng },
                to: { lat: toPlace.lat, lng: toPlace.lng },
            }));
        } else {
            if (!latitude || !longitude) return toast.error('Latitude and longitude are required');
            fd.append('image', mediaFile);
            fd.append('locationDetails', JSON.stringify([Number(latitude), Number(longitude)]));
            if (accuracy != null) fd.append('accuracy', String(Math.round(accuracy)));
        }

        setUploading(true);
        setUploadProgress(0);
        setProcessing(false);

        try {
            const data = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', `${API_BASE}/api/pothole`);
                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100));
                };
                xhr.upload.onload = () => { setUploadProgress(100); setProcessing(true); };
                xhr.onload = () => {
                    let parsed = null;
                    try { parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { parsed = null; }
                    if (xhr.status >= 200 && xhr.status < 300) resolve(parsed);
                    else reject(new Error(parsed?.message || `Upload failed (${xhr.status})`));
                };
                xhr.onerror = () => reject(new Error('Network error during upload'));
                xhr.send(fd);
            });

            toast.success('Upload received — analyzing…');
            setSubmitted({ mediaType, id: data?.id || null, status: data?.id ? 'processing' : 'done', error: null });
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Something went wrong');
        } finally {
            setUploading(false);
            setProcessing(false);
            setUploadProgress(0);
        }
    };

    const tabClass = (active) =>
        `px-4 py-2 rounded text-sm font-medium transition-colors ${active ? 'bg-[#628141] text-white' : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-white'}`;

    const inputClass = 'w-full bg-neutral-800 border border-neutral-700 px-3 py-2 rounded text-white text-sm focus:outline-none focus:border-[#628141]';

    return (
        <div className="min-h-[calc(100vh-80px)] flex items-start justify-center px-4 sm:px-6 py-12 sm:py-16">
            <div className="w-full max-w-xl sm:max-w-3xl mx-auto bg-neutral-900/60 p-6 sm:p-8 rounded-xl border border-neutral-800 shadow-lg">
                <h1 className="text-2xl font-bold text-white mb-2">Report a Pothole</h1>
                <p className="text-neutral-400 mb-6">
                    Upload a photo and pin its exact spot, or upload a video of a road stretch and set its route by place names.
                </p>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Media type */}
                    <div>
                        <label className="block text-sm text-neutral-300 mb-2">Media Type</label>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => handleMediaTypeChange('image')} className={tabClass(mediaType === 'image')}>Image</button>
                            <button type="button" onClick={() => handleMediaTypeChange('video')} className={tabClass(mediaType === 'video')}>Video</button>
                        </div>
                    </div>

                    {/* File picker */}
                    <div>
                        <label className="block text-sm text-neutral-300 mb-2">{mediaType === 'video' ? 'Video file' : 'Image file'}</label>
                        <input
                            key={mediaType}
                            type="file"
                            className="text-amber-50 cursor-pointer"
                            accept={mediaType === 'video' ? 'video/*' : 'image/*'}
                            onChange={handleMediaChange}
                        />
                        <p className="text-xs text-neutral-500 mt-1">
                            {mediaType === 'video' ? 'Max 50MB. MP4, WebM, or MOV.' : 'Max 5MB. JPG, PNG, or WebP.'}
                        </p>
                        {preview && mediaType === 'image' && (
                            <img src={preview} alt="preview" className="mt-4 w-full max-h-60 object-cover rounded border border-neutral-700" />
                        )}
                        {preview && mediaType === 'video' && (
                            <video src={preview} controls className="mt-4 w-full max-h-60 rounded border border-neutral-700 bg-black" />
                        )}
                    </div>

                    {/* IMAGE location: coordinates / GPS */}
                    {mediaType === 'image' && (
                        <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
                            <label className="block text-sm font-semibold text-neutral-200">Location of the pothole</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Latitude</label>
                                    <input value={latitude} onChange={(e) => setLatitude(e.target.value)} className={inputClass} placeholder="e.g. 12.9716" />
                                </div>
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Longitude</label>
                                    <input value={longitude} onChange={(e) => setLongitude(e.target.value)} className={inputClass} placeholder="e.g. 77.5946" />
                                </div>
                            </div>
                            {accuracy !== null && (
                                <span className={`inline-block text-xs px-2 py-1 rounded ${accuracy > 1000 ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'}`}>
                                    Accuracy: {Math.round(accuracy)} m
                                </span>
                            )}
                            {locationError && <div className="text-sm text-red-400">{locationError}</div>}
                            <div className="flex flex-wrap gap-3">
                                <button type="button" onClick={handleUseMyLocation} disabled={locating} className="px-4 py-2 bg-[#628141] hover:bg-[#4f6a34] text-white rounded disabled:opacity-50">
                                    {locating ? 'Locating...' : 'Use my location'}
                                </button>
                                <button type="button" onClick={() => setPickOnMap(true)} className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded">
                                    Pick on map
                                </button>
                            </div>
                        </div>
                    )}

                    {/* VIDEO location: place-based from -> to */}
                    {mediaType === 'video' && (
                        <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
                            <label className="block text-sm font-semibold text-neutral-200">Where was this road stretch? (from → to)</label>

                            {/* From */}
                            <div>
                                <label className="block text-xs text-neutral-400 mb-1">From (place name)</label>
                                <div className="flex gap-2">
                                    <input
                                        value={fromQuery}
                                        onChange={(e) => setFromQuery(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); geocode(fromQuery, 'from'); } }}
                                        className={inputClass}
                                        placeholder="e.g. MG Road, Bengaluru"
                                    />
                                    <button type="button" onClick={() => geocode(fromQuery, 'from')} className="px-3 py-2 bg-[#628141] hover:bg-[#4f6a34] text-white rounded text-sm whitespace-nowrap">
                                        {searching.from ? '...' : 'Search'}
                                    </button>
                                </div>
                                {fromResults.length > 0 && (
                                    <div className="mt-1 bg-neutral-800 border border-neutral-700 rounded max-h-40 overflow-y-auto">
                                        {fromResults.map((p, i) => (
                                            <button key={i} type="button" onClick={() => selectPlace(p, 'from')} className="block w-full text-left px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-700">
                                                {p.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {fromPlace && <p className="text-xs text-[#8bae66] mt-1">✓ {fromPlace.name}</p>}
                            </div>

                            {/* To */}
                            <div>
                                <label className="block text-xs text-neutral-400 mb-1">To (place name)</label>
                                <div className="flex gap-2">
                                    <input
                                        value={toQuery}
                                        onChange={(e) => setToQuery(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); geocode(toQuery, 'to'); } }}
                                        className={inputClass}
                                        placeholder="e.g. Indiranagar, Bengaluru"
                                    />
                                    <button type="button" onClick={() => geocode(toQuery, 'to')} className="px-3 py-2 bg-[#d98c2b] hover:bg-[#bd7720] text-white rounded text-sm whitespace-nowrap">
                                        {searching.to ? '...' : 'Search'}
                                    </button>
                                </div>
                                {toResults.length > 0 && (
                                    <div className="mt-1 bg-neutral-800 border border-neutral-700 rounded max-h-40 overflow-y-auto">
                                        {toResults.map((p, i) => (
                                            <button key={i} type="button" onClick={() => selectPlace(p, 'to')} className="block w-full text-left px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-700">
                                                {p.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {toPlace && <p className="text-xs text-[#e7b06a] mt-1">✓ {toPlace.name}</p>}
                            </div>

                            <div ref={routeMapContainerRef} className="w-full h-56 rounded border border-neutral-700" />
                            <p className="text-xs text-neutral-500">Type a place and press Search, then choose a suggestion. The pin is placed at the midpoint of your route.</p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                        <button type="submit" disabled={uploading} className="px-5 py-2.5 bg-[#628141] hover:bg-[#4f6a34] text-white rounded font-semibold disabled:opacity-50">
                            {uploading ? (processing ? 'Finishing...' : 'Uploading...') : 'Submit Report'}
                        </button>
                        <button type="button" onClick={resetForm} className="text-sm text-neutral-400 hover:text-white">Reset</button>
                    </div>

                    {aiResult && (
                        <div className="mt-2 rounded-xl border border-[#628141]/30 bg-[#628141]/10 p-4 text-white">
                            <h2 className="text-lg font-semibold mb-2">AI Detection Result</h2>
                            <p className="text-sm text-neutral-300">Severity: <span className="font-semibold text-white">{aiResult.severity || 'unknown'}</span></p>
                            <p className="text-sm text-neutral-300">Confidence: <span className="font-semibold text-white">{aiResult.confidence != null ? `${(aiResult.confidence * 100).toFixed(0)}%` : 'N/A'}</span></p>
                            <p className="text-sm text-neutral-300">Detections: <span className="font-semibold text-white">{Array.isArray(aiResult.detections) ? aiResult.detections.length : 0}</span></p>
                        </div>
                    )}
                </form>
            </div>

            {/* Image map picker modal */}
            {pickOnMap && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
                    <div className="bg-neutral-900 rounded-lg p-4 w-full max-w-lg sm:max-w-3xl border border-neutral-700">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-white font-semibold">Pick location on map</div>
                            <button onClick={() => setPickOnMap(false)} className="text-sm text-neutral-400 hover:text-white">Close</button>
                        </div>
                        <div ref={pickerContainerRef} className="w-full h-64 sm:h-72 rounded mb-3 border border-neutral-700" />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setPickOnMap(false)} className="px-3 py-2 bg-neutral-700 text-white rounded">Cancel</button>
                            <button onClick={confirmPickerSelection} className="px-3 py-2 bg-[#628141] hover:bg-[#4f6a34] text-white rounded">Confirm location</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload / processing overlay */}
            {uploading && (
                <div className="fixed inset-0 z-1000 flex items-center justify-center bg-black/70 px-4">
                    <div className="bg-neutral-900 rounded-xl p-6 w-full max-w-md border border-neutral-700 shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-2 border-neutral-600 border-t-[#628141]"></div>
                            <h3 className="text-white font-semibold">
                                {processing ? 'Finishing up' : `Uploading ${mediaType}`}
                            </h3>
                            <span className="ml-auto font-mono text-sm text-neutral-300">{processing ? 'Almost done' : `${uploadProgress}%`}</span>
                        </div>
                        <div className="w-full bg-neutral-800 rounded-full h-3 overflow-hidden border border-neutral-700">
                            {processing ? (
                                <div className="h-3 w-1/3 rounded-full bg-[#d98c2b] animate-[indeterminate_1.2s_ease-in-out_infinite]"></div>
                            ) : (
                                <div className="h-3 rounded-full bg-[#628141] transition-all duration-200" style={{ width: `${uploadProgress}%` }}></div>
                            )}
                        </div>
                        <p className="text-xs text-neutral-500 mt-3">
                            {processing
                                ? "Your file reached the server. AI analysis runs in the background — your report will appear on the map shortly."
                                : 'Sending your file to the server.'}
                        </p>
                    </div>
                </div>
            )}

            {/* Post-upload confirmation: reflects real processing status */}
            {submitted && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 px-4">
                    <div className="bg-neutral-900 rounded-2xl p-7 sm:p-8 w-full max-w-md border border-neutral-700 shadow-2xl text-center">
                        {submitted.status === 'failed' ? (
                            <>
                                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 border border-red-500/40">
                                    <svg className="h-8 w-8 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                </div>
                                <h2 className="text-xl font-bold text-white mb-2">Upload failed</h2>
                                <p className="text-sm text-neutral-300 leading-relaxed">
                                    {submitted.error ||
                                        `Your ${submitted.mediaType} could not be uploaded. Please try again.`}
                                </p>
                                <div className="mt-6 flex flex-col gap-3">
                                    <button
                                        onClick={handleReportAnother}
                                        className="px-4 py-2.5 bg-[#628141] hover:bg-[#4f6a34] text-white rounded-lg font-semibold text-sm"
                                    >
                                        Try again
                                    </button>
                                    <button onClick={() => navigate('/map')} className="text-sm text-neutral-400 hover:text-white">
                                        Go to map
                                    </button>
                                </div>
                            </>
                        ) : submitted.status === 'done' ? (
                            <>
                                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#628141]/15 border border-[#628141]/40">
                                    <svg className="h-8 w-8 text-[#8bae66]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 6 9 17l-5-5" />
                                    </svg>
                                </div>
                                <h2 className="text-xl font-bold text-white mb-2">Report analyzed & saved!</h2>
                                <p className="text-sm text-neutral-300 leading-relaxed">
                                    Your {submitted.mediaType} has been analyzed and added to the map.
                                    {submitted.severity ? ` Detected severity: ${String(submitted.severity).toUpperCase()}` : ''}
                                    {submitted.confidence != null ? ` (${(submitted.confidence * 100).toFixed(0)}% confidence).` : '.'}
                                </p>
                                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <button onClick={() => navigate('/map')} className="px-4 py-2.5 bg-[#628141] hover:bg-[#4f6a34] text-white rounded-lg font-semibold text-sm">
                                        View Map
                                    </button>
                                    <button onClick={() => navigate('/dashboard')} className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white rounded-lg font-semibold text-sm">
                                        View Dashboard
                                    </button>
                                </div>
                                <button onClick={handleReportAnother} className="mt-3 text-sm text-neutral-400 hover:text-white">
                                    Report another pothole
                                </button>
                            </>
                        ) : (
                            <>
                                {/* processing / timeout */}
                                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#628141]/15 border border-[#628141]/40">
                                    {submitted.status === 'timeout' ? (
                                        <svg className="h-8 w-8 text-[#e7b06a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10" />
                                            <path d="M12 6v6l4 2" />
                                        </svg>
                                    ) : (
                                        <div className="animate-spin rounded-full h-9 w-9 border-[3px] border-neutral-700 border-t-[#8bae66]" />
                                    )}
                                </div>
                                <h2 className="text-xl font-bold text-white mb-2">
                                    {submitted.status === 'timeout' ? 'Still processing…' : 'Analyzing your report…'}
                                </h2>
                                <p className="text-sm text-neutral-300 leading-relaxed">
                                    Thanks for helping keep the roads safe. Your {submitted.mediaType} is being
                                    analyzed by our AI to detect and mark potholes.
                                </p>

                                <div className="mt-4 rounded-lg border border-[#d98c2b]/30 bg-[#d98c2b]/10 p-3 flex items-start gap-2.5 text-left">
                                    <svg className="h-5 w-5 flex-shrink-0 text-[#e7b06a] mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M12 6v6l4 2" />
                                    </svg>
                                    <p className="text-xs text-[#e7b06a] leading-relaxed">
                                        {submitted.mediaType === 'video'
                                            ? "This can take a little while — videos are scanned frame by frame. Your report will appear on the map and dashboard once analysis finishes."
                                            : "This takes a few moments. Your report will appear on the map and dashboard shortly."}
                                        {' '}You don't need to wait here — feel free to browse.
                                    </p>
                                </div>

                                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <button onClick={() => navigate('/map')} className="px-4 py-2.5 bg-[#628141] hover:bg-[#4f6a34] text-white rounded-lg font-semibold text-sm">
                                        View Map
                                    </button>
                                    <button onClick={() => navigate('/dashboard')} className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white rounded-lg font-semibold text-sm">
                                        View Dashboard
                                    </button>
                                </div>
                                <button onClick={handleReportAnother} className="mt-3 text-sm text-neutral-400 hover:text-white">
                                    Report another pothole
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
