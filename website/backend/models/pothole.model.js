import mongoose from "mongoose";

const potholeSchema = new mongoose.Schema({
    location: {
        type: {
            type: String,
            enum: ["Point"],
            required: true
        },
        coordinates: {
            type: [Number], 
            required: true
        }
    },
    severity: {
        type: String,
        enum: ["low", "medium", "high"],
        // Not required at creation time: reports start in "processing" and get
        // their severity once AI analysis finishes.
    },
    confidence: {
        type: Number,
    },
    mediaType: {
        type: String,
        enum: ["image", "video"],
        default: "image"
    },
    imageURL: {
        type: String
    },
    videoURL: {
        type: String
    },
    accuracy: {
        type: Number
    },
    source: {
        type: String,
        enum: ["upload", "live"],
        default: "upload"
    },
    route: {
        fromName: { type: String },
        toName: { type: String },
        from: {
            lat: { type: Number },
            lng: { type: Number }
        },
        to: {
            lat: { type: Number },
            lng: { type: Number }
        }
    },
    status: {
        type: String,
        enum: ["repaired", "unrepaired"],
        default: "unrepaired"
    },
    // Lifecycle of the AI analysis + media upload done in the background.
    processingStatus: {
        type: String,
        enum: ["processing", "done", "failed"],
        default: "done"
    },
    // Where the media is hosted once processing completes.
    storage: {
        type: String,
        enum: ["cloudinary", "local"],
    },
    // Human-readable reason when processingStatus is "failed".
    error: {
        type: String,
    }
},{
    timestamps: true
});

potholeSchema.pre("validate", async function () {
    // Media URL is only required once processing is finished successfully.
    if (this.processingStatus !== "done") return;
    if (this.mediaType === "video" && !this.videoURL) {
        throw new Error("videoURL is required for video reports");
    }
    if (this.mediaType === "image" && !this.imageURL) {
        throw new Error("imageURL is required for image reports");
    }
});

//index on the basis of geo earth (provided by mongodb)
potholeSchema.index({ location: "2dsphere" });

export const Pothole = mongoose.model("Pothole", potholeSchema);
