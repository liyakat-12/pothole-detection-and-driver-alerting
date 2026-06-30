import express from "express"
import { multipartRequestHandlerMiddleware } from "../middleware/multer.middleware.js"
import { uploadPotholeData, analyzePotholeImage, liveDetect, getNearbyPotholes, getAllPotholes } from "../controllers/pothole.controller.js";

const router = express.Router()

router.get('/', getAllPotholes);
router.post('/', multipartRequestHandlerMiddleware, uploadPotholeData);
router.post('/analyze', multipartRequestHandlerMiddleware, analyzePotholeImage);
router.post('/live-detect', multipartRequestHandlerMiddleware, liveDetect);
router.post('/near', getNearbyPotholes);

export default router