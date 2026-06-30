import multer from "multer";

const storage = multer.memoryStorage();

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_VIDEO_SIZE,
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
            cb(null, true);
        } else {
            cb(new Error("Only image and video files are allowed"), false);
        }
    }
});

const handleMulterError = (err, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
                message: "File too large (images max 5MB, videos max 50MB)",
            });
        }
        return res.status(400).json({ message: err.message });
    }

    if (err) {
        return res.status(400).json({ message: err.message });
    }

    next();
};

const validateFileSizes = (req, res, next) => {
    const imageFile = req.files?.image?.[0];
    const videoFile = req.files?.video?.[0];

    if (imageFile && imageFile.size > MAX_IMAGE_SIZE) {
        return res.status(413).json({ message: "Image size must be less than 5MB" });
    }
    if (videoFile && videoFile.size > MAX_VIDEO_SIZE) {
        return res.status(413).json({ message: "Video size must be less than 50MB" });
    }

    next();
};

export const multipartRequestHandlerMiddleware = (req, res, next) => {
    upload.fields([
        { name: "image", maxCount: 1 },
        { name: "video", maxCount: 1 },
    ])(req, res, (err) => {
        if (err) return handleMulterError(err, res, next);
        validateFileSizes(req, res, next);
    });
};
