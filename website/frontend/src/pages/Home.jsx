import { useNavigate } from 'react-router-dom';

export default function Home() {
    const navigate = useNavigate();

    const features = [
        {
            icon: '🗺️',
            title: 'Nearby Potholes',
            desc: 'See road damage around you on a live map. Tap any marker for its photo or video, severity and AI confidence.',
            accent: 'from-[#628141] to-[#8bae66]',
        },
        {
            icon: '📤',
            title: 'Upload Photo or Video',
            desc: 'Report a single spot with a photo, or a whole road stretch with a video — located by place names (from → to).',
            accent: 'from-[#d98c2b] to-[#eab464]',
        },
        {
            icon: '🎥',
            title: 'Live Detection',
            desc: 'Stream your camera while you travel. The AI scans the road in real time and auto-saves detections with GPS.',
            accent: 'from-[#628141] to-[#d98c2b]',
        },
    ];

    const steps = [
        { n: '01', t: 'Capture', d: 'Snap a photo, record a clip, or go live.' },
        { n: '02', t: 'Detect', d: 'YOLO AI marks each pothole and rates severity.' },
        { n: '03', t: 'Map it', d: 'Reports are pinned for the whole community.' },
    ];

    return (
        <div className="min-h-[calc(100vh-80px)] px-6 py-16 sm:py-24">
            <div className="max-w-6xl mx-auto">
                {/* Hero */}
                <div className="text-center">
                    <div className="inline-flex items-center gap-2 bg-[#628141]/15 text-[#bcd69b] border border-[#628141]/30 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide uppercase">
                        <span className="w-2 h-2 rounded-full bg-[#8bae66] animate-pulse" />
                        AI-Powered Road Safety
                    </div>

                    <h1 className="mt-8 text-5xl md:text-7xl font-extrabold text-white leading-[1.05]">
                        Spot, Report &amp; Track
                        <span className="block bg-linear-to-r from-[#8bae66] via-[#a9c97f] to-[#d98c2b] bg-clip-text text-transparent">
                            Potholes in Real Time
                        </span>
                    </h1>

                    <p className="mt-7 text-lg text-neutral-300 max-w-2xl mx-auto leading-relaxed">
                        A community-powered map of road damage. Upload a photo or video, or stream live while you travel —
                        potholes are detected, marked and pinned to the map automatically.
                    </p>

                    <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
                        <button
                            onClick={() => navigate('/map')}
                            className="bg-[#628141] hover:bg-[#4f6a34] text-white px-8 py-3.5 rounded-xl font-semibold transition-all shadow-lg shadow-[#628141]/25 hover:shadow-xl hover:-translate-y-0.5"
                        >
                            Open the Map
                        </button>
                        <button
                            onClick={() => navigate('/live')}
                            className="bg-[#d98c2b] hover:bg-[#bd7720] text-white px-8 py-3.5 rounded-xl font-semibold transition-all shadow-lg shadow-[#d98c2b]/25 hover:shadow-xl hover:-translate-y-0.5"
                        >
                            Start Live Detection
                        </button>
                        <button
                            onClick={() => navigate('/report')}
                            className="border border-neutral-700 text-neutral-200 hover:bg-neutral-800/60 hover:border-[#628141] hover:text-white px-8 py-3.5 rounded-xl font-semibold transition-all"
                        >
                            Report a Pothole
                        </button>
                    </div>
                </div>

                {/* Feature cards */}
                <div className="grid md:grid-cols-3 gap-6 mt-24 text-left">
                    {features.map((f) => (
                        <div
                            key={f.title}
                            className="group relative bg-neutral-900/50 rounded-2xl border border-neutral-800 p-7 overflow-hidden hover:border-[#628141]/50 transition-all hover:-translate-y-1"
                        >
                            <div className={`absolute inset-x-0 top-0 h-1 bg-linear-to-r ${f.accent}`} />
                            <div className="text-4xl mb-5">{f.icon}</div>
                            <h3 className="text-xl font-bold text-white mb-2">{f.title}</h3>
                            <p className="text-neutral-400 leading-relaxed">{f.desc}</p>
                        </div>
                    ))}
                </div>

                {/* How it works */}
                <div className="mt-24">
                    <h2 className="text-center text-3xl font-bold text-white mb-12">How it works</h2>
                    <div className="grid md:grid-cols-3 gap-6">
                        {steps.map((s) => (
                            <div key={s.n} className="bg-neutral-900/40 rounded-2xl border border-neutral-800 p-7">
                                <div className="text-5xl font-extrabold text-[#628141]/40">{s.n}</div>
                                <h3 className="mt-3 text-lg font-bold text-white">{s.t}</h3>
                                <p className="mt-1 text-neutral-400">{s.d}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
