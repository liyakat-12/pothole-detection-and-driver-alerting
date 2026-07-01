import { Pothole } from "../models/pothole.model.js";
import { uploadBufferToCloudinary, uploadBufferToCloudinaryWithRetry, getPlayableUrl } from "../services/cloudinary.service.js";
import { sendToAIModel } from "../services/ai.service.js";
import { shouldTriggerAlert } from "../utils/alertPothole.util.js";

const getUploadedMediaFile = (req) => {
    const imageFile = req.files?.image?.[0];
    const videoFile = req.files?.video?.[0];

    if (imageFile && videoFile) {
        return { error: "Please upload either an image or a video, not both" };
    }
    if (videoFile) {
        return { file: videoFile, mediaType: "video" };
    }
    if (imageFile) {
        return { file: imageFile, mediaType: "image" };
    }
    return { error: "Image or video is required" };
};

// Resolves the geographic point + optional route info from the request body.
// Images/live use a single [lat, lng] point; videos can use a place-based
// "from -> to" route, in which case the stored point is the route midpoint.
const resolveLocation = (body) => {
    if (body.route) {
        let route;
        try {
            route = typeof body.route === "string" ? JSON.parse(body.route) : body.route;
        } catch {
            return { error: "Invalid route JSON" };
        }

        const from = route.from || {};
        const to = route.to || {};
        if (from.lat == null || from.lng == null || to.lat == null || to.lng == null) {
            return { error: "Route must include valid 'from' and 'to' coordinates" };
        }

        const midLat = (Number(from.lat) + Number(to.lat)) / 2;
        const midLng = (Number(from.lng) + Number(to.lng)) / 2;

        return {
            coordinates: [midLng, midLat],
            route: {
                fromName: route.fromName || "",
                toName: route.toName || "",
                from: { lat: Number(from.lat), lng: Number(from.lng) },
                to: { lat: Number(to.lat), lng: Number(to.lng) },
            },
        };
    }

    if (body.locationDetails) {
        let locationDetails;
        try {
            locationDetails = JSON.parse(body.locationDetails);
        } catch {
            return { error: "Invalid locationDetails JSON" };
        }
        const latitude = locationDetails[0];
        const longitude = locationDetails[1];
        if (latitude == null || longitude == null) {
            return { error: "Latitude and longitude are required" };
        }
        return { coordinates: [Number(longitude), Number(latitude)] };
    }

    return { error: "Location details are required" };
};

// Stores the analyzed media on Cloudinary only (with timeout retries). If it
// fails the error propagates so the report is marked failed and the user is
// told. Returns { mediaUrl, storage }.
const storeMedia = async (buffer, mediaType) => {
    const cloudinaryRes = await uploadBufferToCloudinaryWithRetry(buffer, mediaType);
    return { mediaUrl: getPlayableUrl(cloudinaryRes, mediaType), storage: "cloudinary" };
};

// Runs the slow work (AI detection + media upload) after the HTTP response has
// already been sent, then updates the placeholder record. The client polls the
// status endpoint to learn when it's done (or if it failed).
const processUploadInBackground = async ({ potholeId, buffer, mimetype, mediaType }) => {
    try {
        const aiResult = await sendToAIModel(buffer, mimetype);

        // Prefer the annotated (marked) media produced by the AI so the saved
        // file shows the detected potholes. Fall back to the original upload.
        const bufferToUpload = aiResult.annotatedBuffer || buffer;
        const { mediaUrl, storage } = await storeMedia(bufferToUpload, mediaType);

        await Pothole.findByIdAndUpdate(potholeId, {
            severity: aiResult.severity,
            confidence: aiResult.confidence,
            storage,
            processingStatus: "done",
            error: undefined,
            ...(mediaType === "video" ? { videoURL: mediaUrl } : { imageURL: mediaUrl }),
        });
    } catch (error) {
        console.error("Background pothole processing failed:", error?.message || error);
        await Pothole.findByIdAndUpdate(potholeId, {
            processingStatus: "failed",
            error:
                mediaType === "video"
                    ? "Your video could not be uploaded. Please try again."
                    : "Your image could not be uploaded. Please try again.",
        }).catch(() => null);
    }
};

const uploadPotholeData = async (req, res) => {
    try {
        const media = getUploadedMediaFile(req);
        if (media.error) {
            return res.status(400).json({ message: media.error });
        }

        const { file, mediaType } = media;

        const loc = resolveLocation(req.body);
        if (loc.error) {
            return res.status(400).json({ message: loc.error });
        }

        const accuracy = req.body.accuracy != null && req.body.accuracy !== ""
            ? Number(req.body.accuracy)
            : undefined;

        // Create a placeholder record up-front so the client has an id to poll
        // for status. Media URL + severity are filled in once analysis finishes.
        const pothole = await Pothole.create({
            location: {
                type: "Point",
                coordinates: loc.coordinates,
            },
            mediaType,
            source: "upload",
            processingStatus: "processing",
            ...(accuracy != null && !Number.isNaN(accuracy) ? { accuracy } : {}),
            ...(loc.route ? { route: loc.route } : {}),
        });

        // Respond as soon as the file is received and validated. The AI analysis
        // and media upload continue in the background; the client polls status.
        res.status(202).json({
            message: "Upload received. We're analyzing it in the background.",
            id: pothole._id,
            status: "processing",
            mediaType,
        });

        // Fire-and-forget: capture the in-memory buffer so processing can outlive
        // the request. Failures are recorded on the record for the client to see.
        processUploadInBackground({
            potholeId: pothole._id,
            buffer: file.buffer,
            mimetype: file.mimetype,
            mediaType,
        });

    } catch (error) {
        console.error("Error uploading pothole data:", error);
        if (!res.headersSent) {
            return res.status(500).json({ message: "Something went wrong" });
        }
    }
};

// Lightweight status endpoint the client polls after an upload.
const getPotholeStatus = async (req, res) => {
    try {
        const pothole = await Pothole.findById(req.params.id).select(
            "processingStatus error severity confidence mediaType imageURL videoURL storage"
        );
        if (!pothole) {
            return res.status(404).json({ message: "Report not found" });
        }
        return res.status(200).json({
            status: pothole.processingStatus,
            error: pothole.error || null,
            mediaType: pothole.mediaType,
            severity: pothole.severity,
            confidence: pothole.confidence,
            storage: pothole.storage,
            mediaURL: pothole.mediaType === "video" ? pothole.videoURL : pothole.imageURL,
        });
    } catch (error) {
        console.error("Error getting pothole status:", error);
        return res.status(500).json({ message: "Something went wrong" });
    }
};

// Live detection: receives a single camera frame plus the current GPS location.
// Runs detection and, when a pothole is found (and autosave is on), stores the
// marked frame with that location.
//
// Live frames are noisier (camera shake, reflections, potholes shown on a phone
// screen, etc.), so we run the model at a lower confidence threshold and only
// auto-save when the best detection clears LIVE_SAVE_CONFIDENCE.
const LIVE_DETECT_CONF = 0.15;   // model sensitivity for live frames
const LIVE_SAVE_CONFIDENCE = 0.35; // min confidence to auto-store a detection

const liveDetect = async (req, res) => {
    try {
        const file = req.files?.image?.[0];
        if (!file) {
            return res.status(400).json({ message: "Camera frame is required" });
        }

        const lat = req.body.lat != null ? Number(req.body.lat) : null;
        const lng = req.body.lng != null ? Number(req.body.lng) : null;
        const accuracy = req.body.accuracy != null && req.body.accuracy !== ""
            ? Number(req.body.accuracy)
            : undefined;
        const autosave = req.body.autosave === "true" || req.body.autosave === true;

        const aiResult = await sendToAIModel(file.buffer, file.mimetype, LIVE_DETECT_CONF);

        // "detected" = the model found at least one pothole (any confidence above
        // the live threshold). Saving requires the stronger confidence gate.
        const detected = Array.isArray(aiResult.detections) && aiResult.detections.length > 0;
        const strongEnough = aiResult.confidence >= LIVE_SAVE_CONFIDENCE;

        let saved = null;
        if (detected && strongEnough && autosave && lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
            const bufferToUpload = aiResult.annotatedBuffer || file.buffer;
            const cloudinaryRes = await uploadBufferToCloudinary(bufferToUpload, "image");
            const mediaUrl = getPlayableUrl(cloudinaryRes, "image");

            saved = await Pothole.create({
                location: { type: "Point", coordinates: [lng, lat] },
                severity: aiResult.severity,
                confidence: aiResult.confidence,
                mediaType: "image",
                imageURL: mediaUrl,
                source: "live",
                ...(accuracy != null && !Number.isNaN(accuracy) ? { accuracy } : {}),
            });
        }

        return res.status(200).json({
            detected,
            saved: !!saved,
            data: saved,
            ai: {
                severity: aiResult.severity,
                confidence: aiResult.confidence,
                detections: aiResult.detections,
            },
        });
    } catch (error) {
        console.error("Error in live detection:", error);
        return res.status(500).json({ message: "Something went wrong" });
    }
};

const analyzePotholeImage = async (req, res) => {
    try {
        const media = getUploadedMediaFile(req);
        if (media.error) {
            return res.status(400).json({ message: media.error });
        }

        const { file } = media;
        const aiResult = await sendToAIModel(file.buffer, file.mimetype);

        return res.status(200).json({
            message: "AI analysis completed successfully",
            ai: {
                severity: aiResult.severity,
                confidence: aiResult.confidence,
                detections: aiResult.detections,
            },
        });
    } catch (error) {
        console.error("Error analyzing pothole image:", error);
        return res.status(500).json({ message: "Something went wrong" });
    }
};

const getNearbyPotholes = async (req, res)=>{
    try {
        const {lat, lng, radius} = req.query;
        if(!lat || !lng){
            return res.status(400).json({ message: "Coordinates are required" });
        }

        const searchRadius = Number(radius) || 200;        //default 200m
        const potholes = await Pothole.find({
            processingStatus: { $nin: ["processing", "failed"] },
            location: {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [Number(lng), Number(lat)],
                    },
                    $maxDistance: searchRadius,
                }
            }
        }).limit(20)

        const alerts = potholes.filter(shouldTriggerAlert);
        const alertIds = alerts.map(p => p._id);

        return res.status(200).json({
            nearbyCount: potholes.length,
            nearbyPotholes: potholes,
            alertPotholeIds: alertIds
        })


    } catch (error) {
        console.error("Error getting pothole data:", error);
        return res.status(500).json({ message: "Something went wrong" });
    }
}

const getAllPotholes = async (req, res) => {
    try {
        const { lat, lng } = req.query;

        const RADIUS_20_KM = 20000;     //20km

        // If coordinates provided, filter by 20km radius
        if (lat && lng) {
            const potholes = await Pothole.find({
                processingStatus: { $nin: ["processing", "failed"] },
                location: {
                    $near: {
                        $geometry: {
                            type: "Point",
                            coordinates: [Number(lng), Number(lat)],
                        },
                        $maxDistance: RADIUS_20_KM,
                    }
                }
            })
                .sort({ createdAt: -1 })
                .limit(500);

            return res.status(200).json({
                count: potholes.length,
                potholes: potholes,
                radius: "20 kilometers"
            });
        } else {
            // If no coordinates provided, return latest potholes
            const potholes = await Pothole.find({ processingStatus: { $nin: ["processing", "failed"] } })
                .sort({ createdAt: -1 })
                .limit(500);

            return res.status(200).json({
                count: potholes.length,
                potholes: potholes,
                radius: "all"
            });
        }
    } catch (error) {
        console.error("Error getting all potholes:", error);
        return res.status(500).json({ message: "Something went wrong" });
    }
};


export {
    uploadPotholeData,
    getPotholeStatus,
    analyzePotholeImage,
    liveDetect,
    getNearbyPotholes,
    getAllPotholes
}