import express from "express"
import "dotenv/config"
import connectDB from "./config/db.config.js"
import cookieParser from "cookie-parser";
import cors from "cors"

//routes import
import potholeRouter from "./routes/pothole.routes.js";

const app = express();
const port = process.env.PORT;

//middlewares
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

//cors config
app.use(
    cors({
        origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
        credentials: true,
    })
);

//images path
app.use("/images", express.static("public/images"));

connectDB();

//routes
app.use("/api/pothole", potholeRouter);


app.listen(port, ()=>{
    console.log(`Server is running on port ${port}`);
})