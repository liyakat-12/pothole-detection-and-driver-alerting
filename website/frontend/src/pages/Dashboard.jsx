import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function Dashboard() {
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const [potholes, setPotholes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [severityFilter, setSeverityFilter] = useState('all');
    const [selected, setSelected] = useState(null);

    const detailMapRef = useRef(null);
    const detailMapContainerRef = useRef(null);

    useEffect(() => {
        const fetchPotholes = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/pothole`);
                const text = await res.text();
                let data;
                try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
                if (res.ok) setPotholes((data && data.potholes) || []);
                else console.error('Failed to fetch:', (data && data.message) || text);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchPotholes();
    }, [API_BASE]);

    const total = potholes.length;
    const high = potholes.filter(p => p.severity === 'high').length;
    const medium = potholes.filter(p => p.severity === 'medium').length;
    const low = potholes.filter(p => p.severity === 'low').length;
    const liveCount = potholes.filter(p => p.source === 'live').length;
    const videoCount = potholes.filter(p => p.mediaType === 'video').length;

    const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

    const severityColor = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };

    const severityBadge = (s) => {
        if (s === 'high') return 'bg-red-500/10 text-red-400 border-red-500/20';
        if (s === 'medium') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
        if (s === 'low') return 'bg-[#628141]/10 text-[#8bae66] border-[#628141]/20';
        return 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20';
    };

    const stats = [
        { label: 'Total Reports', value: total, sub: 'All time', color: 'text-white', ring: 'border-neutral-800' },
        { label: 'High Severity', value: high, sub: 'Critical', color: 'text-red-400', ring: 'border-red-500/20' },
        { label: 'Medium Severity', value: medium, sub: 'Monitor', color: 'text-amber-400', ring: 'border-amber-500/20' },
        { label: 'Low Severity', value: low, sub: 'Minor', color: 'text-[#8bae66]', ring: 'border-[#628141]/30' },
    ];

    const filters = [
        { id: 'all', label: 'All', count: total },
        { id: 'high', label: 'High', count: high },
        { id: 'medium', label: 'Medium', count: medium },
        { id: 'low', label: 'Low', count: low },
    ];

    const filtered = severityFilter === 'all'
        ? potholes
        : potholes.filter(p => p.severity === severityFilter);

    // Mini map inside the detail modal
    useEffect(() => {
        if (!selected || !detailMapContainerRef.current) return;
        const coords = selected.location?.coordinates;
        if (!coords) return;
        const lat = coords[1];
        const lng = coords[0];

        const map = L.map(detailMapContainerRef.current, { center: [lat, lng], zoom: 15, zoomControl: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);
        L.circleMarker([lat, lng], {
            radius: 10,
            color: '#fff',
            weight: 2,
            fillColor: severityColor[selected.severity] || '#10b981',
            fillOpacity: 1,
        }).addTo(map);
        detailMapRef.current = map;
        setTimeout(() => map.invalidateSize(), 120);

        return () => {
            try { map.remove(); } catch (e) { /* ignore */ }
            detailMapRef.current = null;
        };
    }, [selected]);

    const isVideo = (p) => p?.mediaType === 'video' || (!!p?.videoURL && !p?.imageURL);

    return (
        <div className="min-h-[calc(100vh-80px)] py-16 px-6">
            <div className="max-w-7xl mx-auto">
                <div className="mb-10">
                    <h1 className="text-3xl md:text-4xl font-bold text-white">Dashboard</h1>
                    <p className="text-neutral-400 mt-2">Overview of all reported potholes</p>
                </div>

                {/* Stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
                    {stats.map((s) => (
                        <div key={s.label} className={`bg-neutral-900/50 p-6 rounded-2xl border ${s.ring} shadow-lg`}>
                            <div className="text-neutral-400 text-xs font-semibold mb-2 uppercase tracking-wider">{s.label}</div>
                            <div className={`text-4xl font-extrabold mb-1 ${s.color}`}>{loading ? '—' : s.value}</div>
                            <div className="text-xs text-neutral-500">{s.sub}</div>
                        </div>
                    ))}
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Severity distribution */}
                    <div className="lg:col-span-1 bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800 shadow-lg">
                        <h2 className="text-lg font-semibold text-white mb-5">Severity Breakdown</h2>
                        {[
                            { label: 'High', n: high, bar: 'bg-red-500' },
                            { label: 'Medium', n: medium, bar: 'bg-amber-500' },
                            { label: 'Low', n: low, bar: 'bg-[#628141]' },
                        ].map((row) => (
                            <div key={row.label} className="mb-4">
                                <div className="flex justify-between text-sm mb-1.5">
                                    <span className="text-neutral-300">{row.label}</span>
                                    <span className="text-neutral-400">{row.n} · {pct(row.n)}%</span>
                                </div>
                                <div className="w-full bg-neutral-800 rounded-full h-2.5 overflow-hidden">
                                    <div className={`${row.bar} h-2.5 rounded-full transition-all duration-500`} style={{ width: `${pct(row.n)}%` }} />
                                </div>
                            </div>
                        ))}

                        <div className="mt-6 pt-5 border-t border-neutral-800 grid grid-cols-2 gap-4 text-center">
                            <div>
                                <div className="text-2xl font-bold text-[#8bae66]">{liveCount}</div>
                                <div className="text-xs text-neutral-500 uppercase tracking-wider">Live detections</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-[#e7b06a]">{videoCount}</div>
                                <div className="text-xs text-neutral-500 uppercase tracking-wider">Video reports</div>
                            </div>
                        </div>
                    </div>

                    {/* Reports + filters */}
                    <div className="lg:col-span-2 bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800 shadow-lg">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <h2 className="text-lg font-semibold text-white">Reports</h2>
                            <div className="flex flex-wrap gap-2">
                                {filters.map((f) => (
                                    <button
                                        key={f.id}
                                        onClick={() => setSeverityFilter(f.id)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${severityFilter === f.id
                                            ? 'bg-[#628141] text-white border-[#628141]'
                                            : 'bg-neutral-800/60 text-neutral-300 border-neutral-700 hover:text-white'}`}
                                    >
                                        {f.label} <span className="opacity-70">({f.count})</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {loading ? (
                            <div className="text-neutral-400">Loading...</div>
                        ) : filtered.length === 0 ? (
                            <div className="text-neutral-400">No {severityFilter !== 'all' ? severityFilter + ' severity ' : ''}reports.</div>
                        ) : (
                            <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                                {filtered.map((p) => (
                                    <button
                                        key={p._id}
                                        onClick={() => setSelected(p)}
                                        className="w-full text-left flex items-center justify-between bg-neutral-800/40 hover:bg-neutral-800/80 transition-colors p-3.5 rounded-xl border border-neutral-700/70 hover:border-[#628141]/60"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="text-xl shrink-0">{isVideo(p) ? '🎞️' : '🖼️'}</span>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${severityBadge(p.severity)}`}>
                                                        {p.severity?.toUpperCase() || 'UNKNOWN'}
                                                    </span>
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-700 text-neutral-300">
                                                        {p.source === 'live' ? 'LIVE' : 'UPLOAD'}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-neutral-400 mt-1 truncate">
                                                    {p.route?.fromName ? `${p.route.fromName} → ${p.route.toName}` : `${p.location?.coordinates?.[1]?.toFixed(4)}, ${p.location?.coordinates?.[0]?.toFixed(4)}`}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0 ml-3">
                                            <div className="text-white font-semibold text-sm">{(p.confidence * 100).toFixed(0)}%</div>
                                            <div className="text-xs text-neutral-500">{new Date(p.createdAt).toLocaleDateString()}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Detail modal */}
            {selected && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 overflow-y-auto" onClick={() => setSelected(null)}>
                    <div className="bg-neutral-900 rounded-2xl border border-neutral-700 shadow-2xl w-full max-w-2xl my-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
                            <h3 className="text-white font-semibold flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${severityBadge(selected.severity)}`}>
                                    {selected.severity?.toUpperCase()}
                                </span>
                                Pothole report
                            </h3>
                            <button onClick={() => setSelected(null)} className="text-neutral-400 hover:text-white text-sm">Close ✕</button>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Media */}
                            {isVideo(selected) ? (
                                <video src={selected.videoURL} controls playsInline preload="metadata" className="w-full max-h-72 rounded-lg border border-neutral-700 bg-black">
                                    Your browser does not support video playback.
                                </video>
                            ) : selected.imageURL ? (
                                <img src={selected.imageURL} alt="Pothole" className="w-full max-h-72 object-contain rounded-lg border border-neutral-700 bg-black" />
                            ) : (
                                <div className="text-neutral-500 text-sm">No media available.</div>
                            )}

                            {/* Details */}
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                <div className="flex justify-between col-span-2">
                                    <span className="text-neutral-400">Confidence (accuracy)</span>
                                    <span className="text-white font-semibold">{selected.confidence != null ? `${(selected.confidence * 100).toFixed(0)}%` : 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-neutral-400">Source</span>
                                    <span className="text-white">{selected.source === 'live' ? 'Live' : 'Upload'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-neutral-400">Media</span>
                                    <span className="text-white">{isVideo(selected) ? 'Video' : 'Image'}</span>
                                </div>
                                {selected.accuracy != null && (
                                    <div className="flex justify-between">
                                        <span className="text-neutral-400">GPS accuracy</span>
                                        <span className="text-white">±{Math.round(selected.accuracy)} m</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-neutral-400">Reported</span>
                                    <span className="text-white">{new Date(selected.createdAt).toLocaleString()}</span>
                                </div>
                                {selected.route?.fromName && (
                                    <div className="flex justify-between col-span-2 gap-2">
                                        <span className="text-neutral-400">Route</span>
                                        <span className="text-white text-right">{selected.route.fromName} → {selected.route.toName}</span>
                                    </div>
                                )}
                                <div className="flex justify-between col-span-2">
                                    <span className="text-neutral-400">Coordinates</span>
                                    <span className="text-white font-mono text-xs">
                                        {selected.location?.coordinates?.[1]?.toFixed(5)}, {selected.location?.coordinates?.[0]?.toFixed(5)}
                                    </span>
                                </div>
                            </div>

                            {/* Location map */}
                            <div>
                                <div className="text-sm text-neutral-400 mb-2">Location</div>
                                <div ref={detailMapContainerRef} className="w-full h-56 rounded-lg border border-neutral-700 overflow-hidden" />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
