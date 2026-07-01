import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Distance (meters) within which a pothole counts as "nearby" and gets
// highlighted, and the size of the ring drawn around the user.
const NEARBY_RADIUS_M = 500;

// Compact "x min ago" style relative time.
const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
};

const formatDistance = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export default function Map() {
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const [potholes, setPotholes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPotholeId, setSelectedPotholeId] = useState(null); // FIX: Use ID instead of object

    // Refs for Leaflet map and layers (persist across renders)
    const mapRef = useRef(null);
    const mapContainerRef = useRef(null);
    const markersLayerRef = useRef(null);

    // User location state and refs
    const [userLocation, setUserLocation] = useState(null);
    const [nearbyIds, setNearbyIds] = useState([]);
    const [hasNearby, setHasNearby] = useState(false);
    const [locationError, setLocationError] = useState(null);
    const [locationStatus, setLocationStatus] = useState('requesting'); // 'requesting' | 'granted' | 'denied' | 'timeout'
    const userMarkerRef = useRef(null);
    const userCircleRef = useRef(null);
    const watchIdRef = useRef(null);
    const hasZoomedToUserRef = useRef(false);

    // Haversine formula (returns meters)
    const haversine = (lat1, lon1, lat2, lon2) => {
        const toRad = (v) => (v * Math.PI) / 180;
        const R = 6371000; // Earth radius in meters
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    //Start geolocation on mount
    useEffect(() => {
        if (!navigator.geolocation) {
            setLocationError('Geolocation not supported by your browser');
            setLocationStatus('denied');
            return;
        }

        setLocationStatus('requesting');

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                setUserLocation({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
                setLocationError(null);
                setLocationStatus('granted');
            },
            (error) => {
                console.error('Geolocation error:', error);

                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        setLocationError('Location access denied. Please enable location permissions.');
                        setLocationStatus('denied');
                        break;
                    case error.POSITION_UNAVAILABLE:
                        setLocationError('Location information unavailable. Please check your device settings.');
                        setLocationStatus('denied');
                        break;
                    case error.TIMEOUT:
                        setLocationError('Location request timed out. Retrying...');
                        setLocationStatus('timeout');
                        //watchPosition will retry automatically
                        break;
                    default:
                        setLocationError('An unknown error occurred while getting location.');
                        setLocationStatus('denied');
                }
            },
            {
                enableHighAccuracy: false, // Changed to false - faster response, adequate for 200m radius
                timeout: 15000, // Increased timeout to 15 seconds
                maximumAge: 30000 // Allow cached position up to 30 seconds old
            }
        );

        watchIdRef.current = watchId;

        //Clean up geolocation watcher on unmount
        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, []);

    // Initialize map once
    useEffect(() => {
        if (mapRef.current || !mapContainerRef.current) return;

        const map = L.map(mapContainerRef.current, {
            center: [20, 0],
            zoom: 2,
            preferCanvas: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        markersLayerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;

        return () => {
            try {
                map.remove();
            } catch (e) {
                // ignore
            }
            mapRef.current = null;
            markersLayerRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!userLocation || !mapRef.current || hasZoomedToUserRef.current) return;
        
        mapRef.current.flyTo([userLocation.lat, userLocation.lng], 14, { duration: 1 });
        hasZoomedToUserRef.current = true;
    }, [userLocation]);

    useEffect(() => {
        if (!selectedPotholeId || !mapRef.current) return;
        const pothole = potholes.find(p => p._id === selectedPotholeId);
        if (!pothole) return;
        
        const coords = pothole.location?.coordinates;
        if (!coords) return;
        const lng = coords[0];
        const lat = coords[1];
        mapRef.current.flyTo([lat, lng], 14, { duration: 0.6 });
    }, [selectedPotholeId, potholes]);

    // Update user marker and circle when location changes
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !userLocation) return;

        // Remove old user marker and circle
        if (userMarkerRef.current) {
            map.removeLayer(userMarkerRef.current);
        }
        if (userCircleRef.current) {
            map.removeLayer(userCircleRef.current);
        }

        // Add user position marker (white dot with green ring)
        const userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
            radius: 8,
            fillColor: '#ffffff',
            color: '#628141',
            weight: 3,
            opacity: 1,
            fillOpacity: 1,
        }).addTo(map);
        
        userMarker.bindPopup('<div><strong>Your Location</strong></div>');
        userMarkerRef.current = userMarker;

        // Add nearby-radius circle
        const userCircle = L.circle([userLocation.lat, userLocation.lng], {
            radius: NEARBY_RADIUS_M,
            fillColor: '#628141',
            color: '#628141',
            weight: 2,
            opacity: 0.4,
            fillOpacity: 0.1,
        }).addTo(map);
        
        userCircleRef.current = userCircle;

        return () => {
            if (userMarkerRef.current) {
                map.removeLayer(userMarkerRef.current);
                userMarkerRef.current = null;
            }
            if (userCircleRef.current) {
                map.removeLayer(userCircleRef.current);
                userCircleRef.current = null;
            }
        };
    }, [userLocation]);

    //Update markers when potholes or user location change
    useEffect(() => {
        const map = mapRef.current;
        const markersLayer = markersLayerRef.current;
        if (!map || !markersLayer) return;

        markersLayer.clearLayers();

        const nearby = [];
        const NEARBY_THRESHOLD = NEARBY_RADIUS_M; // meters

        potholes.forEach((pothole) => {
            const coords = pothole.location?.coordinates;
            if (!coords || coords.length < 2) return;
            const lng = coords[0];
            const lat = coords[1];

            // Calculate distance to user (if known)
            let distanceMeters = null;
            if (userLocation) {
                distanceMeters = haversine(userLocation.lat, userLocation.lng, lat, lng);
                if (distanceMeters <= NEARBY_THRESHOLD) {
                    nearby.push(pothole._id);
                }
            }

            const baseColor = pothole.severity === 'high' ? '#ef4444' : pothole.severity === 'medium' ? '#f59e0b' : '#10b981';

            // Make nearby markers visually distinct
            const isNearby = distanceMeters !== null && distanceMeters <= NEARBY_THRESHOLD;
            const marker = L.circleMarker([lat, lng], {
                radius: isNearby ? 12 : 8,
                fillColor: baseColor,
                color: isNearby ? '#fff' : baseColor,
                weight: isNearby ? 3 : 1,
                opacity: 1,
                fillOpacity: isNearby ? 1 : 0.9,
            });

            //Use ID for selection 
            marker.on('click', () => setSelectedPotholeId(pothole._id));

            // Show distance in popup if available
            if (distanceMeters !== null) {
                marker.bindPopup(`<div><strong>${isNearby ? '⚠ ' : ''}${Math.round(distanceMeters)} m away</strong><br/>Severity: ${pothole.severity}</div>`);
            }

            marker.addTo(markersLayer);
        });
        setNearbyIds(nearby);
        setHasNearby(nearby.length > 0);
    }, [potholes, userLocation]);

    useEffect(() => {
        fetchPotholes();
    }, []);

    const fetchPotholes = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE}/api/pothole`, {
                method: 'GET',
            });
            if (response.ok) {
                const data = await response.json();
                setPotholes(data.potholes || []);
            } else {
                const err = await response.json().catch(() => ({ message: 'Failed to fetch potholes' }));
                console.error('Error fetching potholes:', err);
            }
        } catch (error) {
            console.error('Error fetching potholes:', error);
        } finally {
            setLoading(false);
        }
    };

    const recenterToUser = () => {
        if (userLocation && mapRef.current) {
            mapRef.current.flyTo([userLocation.lat, userLocation.lng], 15, { duration: 0.8 });
        }
    };

    const distanceFor = (pothole) => {
        const coords = pothole.location?.coordinates;
        if (!userLocation || !coords || coords.length < 2) return null;
        return haversine(userLocation.lat, userLocation.lng, coords[1], coords[0]);
    };

    const getSeverityBadgeColor = (severity) => {
        switch (severity) {
            case 'high':
                return 'bg-red-500/10 text-red-400 border-red-500/20';
            case 'medium':
                return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
            case 'low':
                return 'bg-green-500/10 text-green-400 border-green-500/20';
            default:
                return 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20';
        }
    };

    // FIX: Get selected pothole by ID
    const selectedPothole = potholes.find(p => p._id === selectedPotholeId);

    return (
        <div className="min-h-[calc(100vh-80px)] py-16 px-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="text-center mb-12">
                    <div className="inline-block bg-linear-to-r from-[#628141] to-[#8bae66] text-white px-6 py-2 rounded-full text-sm font-semibold shadow-lg mb-6">
                        Live Tracking
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Pothole Map</h1>
                    <p className="text-lg text-neutral-400 max-w-2xl mx-auto">
                        Real-time pothole tracking and community reporting system
                    </p>

                    {/* FIX: Show location status with better UX */}
                    {locationStatus === 'requesting' && (
                        <div className="mt-4 inline-flex items-center gap-2 bg-[#628141]/30 text-[#cfe3b6] px-4 py-2 rounded-lg text-sm font-semibold">
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Requesting location access...
                        </div>
                    )}

                    {locationStatus === 'timeout' && (
                        <div className="mt-4 inline-flex items-center gap-2 bg-yellow-900/70 text-yellow-100 px-4 py-2 rounded-lg text-sm font-semibold">
                            <svg className="animate-pulse h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                            </svg>
                            Locating... This may take a moment
                        </div>
                    )}

                    {locationStatus === 'denied' && locationError && (
                        <div className="mt-4 inline-block bg-red-900/70 text-red-100 px-4 py-2 rounded-lg text-sm font-semibold max-w-md">
                            📍 {locationError}
                        </div>
                    )}

                    {locationStatus === 'granted' && !hasNearby && (
                        <div className="mt-4 inline-flex items-center gap-2 bg-green-900/70 text-green-100 px-3 py-1 rounded text-sm font-semibold">
                            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            No potholes nearby
                        </div>
                    )}

                    {hasNearby && (
                        <div className="mt-4 inline-block bg-red-900/70 text-red-100 px-3 py-1 rounded text-sm font-semibold">
                            ⚠ {nearbyIds.length} pothole{nearbyIds.length > 1 ? 's' : ''} within {NEARBY_RADIUS_M}m
                        </div>
                    )}
                </div>

                <div className="grid lg:grid-cols-3 gap-8 mb-12">
                    {/* Map Container */}
                    <div className="lg:col-span-2">
                        <div className="bg-neutral-900/50 rounded-xl overflow-hidden border border-neutral-800 shadow-2xl h-150 backdrop-blur-sm flex flex-col">
                            <div className="bg-neutral-800/50 px-6 py-4 border-b border-neutral-700 flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-white flex items-center">
                                    <svg className="w-5 h-5 mr-2 text-[#628141]" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                    </svg>
                                    Interactive Map View
                                </h2>
                                <span className="text-xs text-neutral-400 hidden sm:inline">Tap a marker for details</span>
                            </div>

                            <div className="relative flex-1">
                                <div ref={mapContainerRef} className="w-full h-full" />

                                {/* Severity legend */}
                                <div className="absolute bottom-3 left-3 z-[1000] bg-neutral-900/90 backdrop-blur border border-neutral-700 rounded-lg px-3 py-2 shadow-lg pointer-events-none">
                                    <p className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5 font-semibold">Severity</p>
                                    <div className="flex flex-col gap-1">
                                        <span className="flex items-center gap-2 text-xs text-neutral-200"><span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" /> High</span>
                                        <span className="flex items-center gap-2 text-xs text-neutral-200"><span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" /> Medium</span>
                                        <span className="flex items-center gap-2 text-xs text-neutral-200"><span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" /> Low</span>
                                    </div>
                                </div>

                                {/* Recenter to my location */}
                                {userLocation && (
                                    <button
                                        onClick={recenterToUser}
                                        title="Recenter to my location"
                                        className="absolute top-3 right-3 z-[1000] flex items-center gap-2 bg-neutral-900/90 backdrop-blur border border-neutral-700 hover:border-[#628141] text-white text-xs font-semibold rounded-lg px-3 py-2 shadow-lg transition-colors"
                                    >
                                        <svg className="h-4 w-4 text-[#8bae66]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <circle cx="12" cy="12" r="3" />
                                            <path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                                        </svg>
                                        My location
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Info Panel */}
                    <div className="lg:col-span-1">
                        <div className="bg-neutral-900/50 rounded-xl border border-neutral-800 shadow-2xl h-150 flex flex-col backdrop-blur-sm">
                            <div className="bg-neutral-800/50 px-6 py-4 border-b border-neutral-700 flex items-start justify-between">
                                <div>
                                    <h2 className="text-lg font-semibold text-white">Recent Reports</h2>
                                    <p className="text-sm text-neutral-400 mt-1">{potholes.length} total reports</p>
                                </div>
                                <button
                                    onClick={fetchPotholes}
                                    disabled={loading}
                                    title="Refresh"
                                    className="flex items-center gap-1.5 text-xs font-semibold text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                                >
                                    <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-3M20 15a8 8 0 01-14 3" />
                                    </svg>
                                    Refresh
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6">
                                {loading ? (
                                    <div className="flex flex-col items-center justify-center h-full">
                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#628141]"></div>
                                        <p className="text-neutral-400 mt-4">Loading reports...</p>
                                    </div>
                                ) : potholes.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center">
                                        <svg className="w-16 h-16 text-neutral-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <p className="text-neutral-400 font-medium">No potholes reported yet</p>
                                        <p className="text-neutral-500 text-sm mt-2">Be the first to report!</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {potholes.map((pothole, index) => {
                                            const isNearby = nearbyIds.includes(pothole._id);
                                            const dist = distanceFor(pothole);
                                            const conf = pothole.confidence != null ? pothole.confidence * 100 : 0;
                                            return (
                                                <div
                                                    key={pothole._id || index}
                                                    onClick={() => setSelectedPotholeId(selectedPotholeId === pothole._id ? null : pothole._id)}
                                                    className={`p-4 rounded-lg cursor-pointer transition-all duration-200 ${selectedPotholeId === pothole._id
                                                            ? 'bg-[#628141]/20 border-[#628141] shadow-lg scale-[1.02]'
                                                            : 'bg-neutral-800/50 border-neutral-700 hover:border-[#628141] hover:bg-neutral-800/70'
                                                        } border ${isNearby ? 'ring-2 ring-red-500/50' : ''}`}
                                                >
                                                    <div className="flex items-start justify-between mb-2 gap-2">
                                                        <p className="font-semibold text-white flex items-center gap-1.5 min-w-0">
                                                            <span className="text-neutral-500 text-xs">{pothole.mediaType === 'video' ? '🎥' : '📷'}</span>
                                                            <span className="truncate">{isNearby && '⚠ '}Report #{index + 1}</span>
                                                        </p>
                                                        <span className={`px-2 py-1 rounded text-xs font-medium border shrink-0 ${getSeverityBadgeColor(pothole.severity)}`}>
                                                            {pothole.severity?.toUpperCase() || 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between text-xs text-neutral-400 mb-2">
                                                        <span>{timeAgo(pothole.createdAt)}</span>
                                                        {dist != null && (
                                                            <span className={isNearby ? 'text-red-300 font-semibold' : 'text-neutral-300'}>
                                                                {formatDistance(dist)} away
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center justify-between text-sm">
                                                        <span className="text-neutral-400">Confidence:</span>
                                                        <span className="text-white font-medium">{conf.toFixed(0)}%</span>
                                                    </div>
                                                    <div className="mt-2 w-full bg-neutral-700 rounded-full h-1.5">
                                                        <div
                                                            className="bg-[#628141] h-1.5 rounded-full transition-all duration-300"
                                                            style={{ width: `${conf}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Selected Pothole Details */}
                            {selectedPothole && (
                                <div className="border-t border-neutral-700 p-6 bg-neutral-800/30">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-bold text-white flex items-center">
                                            <svg className="w-5 h-5 mr-2 text-[#628141]" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                            </svg>
                                            Details
                                        </h3>
                                        <button
                                            onClick={() => setSelectedPotholeId(null)}
                                            title="Close details"
                                            aria-label="Close details"
                                            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700 border border-neutral-700 transition-colors"
                                        >
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                    {(selectedPothole.videoURL || selectedPothole.imageURL) && (
                                        selectedPothole.mediaType === 'video' || selectedPothole.videoURL ? (
                                            <video
                                                src={selectedPothole.videoURL}
                                                controls
                                                playsInline
                                                preload="metadata"
                                                className="w-full max-h-48 rounded-lg mb-4 border border-neutral-700 shadow-lg bg-black"
                                            >
                                                Your browser does not support video playback.
                                            </video>
                                        ) : (
                                            <img
                                                src={selectedPothole.imageURL}
                                                alt="Pothole"
                                                className="w-full h-32 object-cover rounded-lg mb-4 border border-neutral-700 shadow-lg"
                                            />
                                        )
                                    )}
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between items-center">
                                            <span className="text-neutral-400">Severity:</span>
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getSeverityBadgeColor(selectedPothole.severity)}`}>
                                                {selectedPothole.severity?.toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-neutral-400">Confidence (accuracy):</span>
                                            <span className="text-white font-semibold">
                                                {selectedPothole.confidence != null ? `${(selectedPothole.confidence * 100).toFixed(0)}%` : 'N/A'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-neutral-400">Source:</span>
                                            <span className="text-white text-xs">
                                                {selectedPothole.source === 'live' ? '🎥 Live detection' : '📤 Upload'}
                                                {selectedPothole.mediaType === 'video' ? ' · video' : ' · image'}
                                            </span>
                                        </div>
                                        {selectedPothole.accuracy != null && (
                                            <div className="flex justify-between">
                                                <span className="text-neutral-400">GPS accuracy:</span>
                                                <span className="text-white">±{Math.round(selectedPothole.accuracy)} m</span>
                                            </div>
                                        )}
                                        {selectedPothole.route?.fromName && (
                                            <div className="flex justify-between gap-2">
                                                <span className="text-neutral-400">Route:</span>
                                                <span className="text-white text-xs text-right">
                                                    {selectedPothole.route.fromName} → {selectedPothole.route.toName}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex justify-between">
                                            <span className="text-neutral-400">Location:</span>
                                            <span className="text-white font-mono text-xs">
                                                {selectedPothole.location?.coordinates?.[1]?.toFixed(4)}, {selectedPothole.location?.coordinates?.[0]?.toFixed(4)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-neutral-400">Reported:</span>
                                            <span className="text-white">
                                                {new Date(selectedPothole.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="bg-neutral-900/50 p-6 rounded-xl border border-neutral-800 text-center shadow-lg backdrop-blur-sm hover:border-neutral-700 transition-colors">
                        <div className="text-neutral-400 text-sm font-semibold mb-2 uppercase tracking-wider">Total Reports</div>
                        <div className="text-4xl font-bold text-white mb-1">{potholes.length}</div>
                        <div className="text-xs text-neutral-500">All time</div>
                    </div>
                    <div className="bg-neutral-900/50 p-6 rounded-xl border border-red-500/20 text-center shadow-lg backdrop-blur-sm hover:border-red-500/40 transition-colors">
                        <div className="text-neutral-400 text-sm font-semibold mb-2 uppercase tracking-wider">High Severity</div>
                        <div className="text-4xl font-bold text-red-500 mb-1">
                            {potholes.filter(p => p.severity === 'high').length}
                        </div>
                        <div className="text-xs text-neutral-500">Critical</div>
                    </div>
                    <div className="bg-neutral-900/50 p-6 rounded-xl border border-yellow-500/20 text-center shadow-lg backdrop-blur-sm hover:border-yellow-500/40 transition-colors">
                        <div className="text-neutral-400 text-sm font-semibold mb-2 uppercase tracking-wider">Medium Severity</div>
                        <div className="text-4xl font-bold text-yellow-500 mb-1">
                            {potholes.filter(p => p.severity === 'medium').length}
                        </div>
                        <div className="text-xs text-neutral-500">Monitor</div>
                    </div>
                    <div className="bg-neutral-900/50 p-6 rounded-xl border border-green-500/20 text-center shadow-lg backdrop-blur-sm hover:border-green-500/40 transition-colors">
                        <div className="text-neutral-400 text-sm font-semibold mb-2 uppercase tracking-wider">Low Severity</div>
                        <div className="text-4xl font-bold text-green-500 mb-1">
                            {potholes.filter(p => p.severity === 'low').length}
                        </div>
                        <div className="text-xs text-neutral-500">Minor</div>
                    </div>
                </div>
            </div>
        </div>
    );
}