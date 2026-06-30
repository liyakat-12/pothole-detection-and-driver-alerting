import mongoose from "mongoose";

const buildMongoUri = () => {
    const base = process.env.MONGO_DB_URL?.trim();
    const dbName = process.env.DB_NAME?.trim();

    if (!base) {
        throw new Error("MONGO_DB_URL is not set in the environment");
    }

    const hasDatabaseInPath = /^mongodb(?:\+srv)?:\/\/[^/]+\/[^?]+/.test(base);
    if (hasDatabaseInPath) {
        return base;
    }

    if (!dbName) {
        return base;
    }

    return base.replace(/\/(\?.*)?$/, `/${dbName}$1`);
};

const connectDB = async () => {
    try {
        const mongoUri = buildMongoUri();
        await mongoose.connect(mongoUri);
        console.log("Database connected");
    } catch (error) {
        console.log("Error in connecting DB: ", error);
    }
};

export default connectDB
