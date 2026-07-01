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
            // Give larger video uploads room to finish before the client aborts.
            timeout: 120000,
        };

        if (isVideo) {
            // OpenCV writes the annotated clip with the mp4v codec, which browsers
            // can't play. Transcode to H.264 in the BACKGROUND (eager_async) so the
            // upload request returns immediately instead of timing out (499) while
            // waiting for the transcode. Delivery still works via getPlayableUrl,
            // which requests an on-the-fly H.264 stream.
            options.eager = [{ video_codec: "h264", format: "mp4" }];
            options.eager_async = true;
        }

        const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) return reject(error);
            resolve(result);
        });
        stream.end(buffer);
    });
};

const isTimeoutError = (err) =>
    err?.http_code === 499 ||
    err?.name === "TimeoutError" ||
    /timeout/i.test(err?.message || "");

// Upload with a few retries, since Cloudinary occasionally returns 499
// "Request Timeout" on larger videos. Only timeout-like errors are retried.
export const uploadBufferToCloudinaryWithRetry = async (buffer, mediaType = "image", retries = 2) => {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await uploadBufferToCloudinary(buffer, mediaType);
        } catch (err) {
            lastErr = err;
            if (!isTimeoutError(err) || attempt === retries) break;
            // brief backoff before retrying
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
    }
    throw lastErr;
};

// Returns a browser-playable delivery URL for the uploaded media.
export const getPlayableUrl = (result, mediaType = "image") => {
    if (mediaType === "video") {
        // Request an H.264 mp4 via an on-the-fly delivery transformation. This
        // works immediately (Cloudinary transcodes on first request and caches),
        // so we don't have to wait for the background eager transcode to finish.
        return cloudinary.url(result.public_id, {
            resource_type: "video",
            format: "mp4",
            transformation: [{ video_codec: "h264" }],
        });
    }
    return result.secure_url;
};