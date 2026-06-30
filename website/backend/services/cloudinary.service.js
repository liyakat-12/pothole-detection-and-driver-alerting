import { v2 as cloudinary } from 'cloudinary';


// config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

//upload to cloudinary
export const uploadBufferToCloudinary = (buffer, mediaType = "image") => {
    return new Promise((resolve, reject) => {
        const isVideo = mediaType === "video";
        const options = {
            folder: "liyakat",
            resource_type: isVideo ? "video" : "image",
        };

        if (isVideo) {
            // OpenCV writes the annotated clip with the mp4v codec, which browsers
            // can't play. Eagerly transcode to H.264 so the <video> tag works.
            options.eager = [{ video_codec: "h264", format: "mp4" }];
            options.eager_async = false;
        }

        const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) return reject(error);
            resolve(result);
        });
        stream.end(buffer);
    });
};

// Returns a browser-playable delivery URL for the uploaded media.
export const getPlayableUrl = (result, mediaType = "image") => {
    if (mediaType === "video") {
        const eagerUrl = result?.eager?.[0]?.secure_url;
        if (eagerUrl) return eagerUrl;

        // Fallback: request an H.264 mp4 via an on-the-fly delivery transformation.
        return cloudinary.url(result.public_id, {
            resource_type: "video",
            format: "mp4",
            transformation: [{ video_codec: "h264" }],
        });
    }
    return result.secure_url;
};