import mongoose from "mongoose";

const mongoDBURL = process.env.MONGO_DB_URL?.trim();

const connectDB = async () => {
    try {
        await mongoose.connect(mongoDBURL);
        console.log("Database connected");
    } catch (error) {
        console.log("Error in connecting DB: ", error);
    }
};

export default connectDB
