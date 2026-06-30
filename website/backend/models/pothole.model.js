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
        required: true
    },
    confidence: {
        type: Number,
        required: true
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
    }
},{
    timestamps: true
});

potholeSchema.pre("validate", async function () {
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
