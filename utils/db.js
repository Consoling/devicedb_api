const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = async () => {
    if (mongoose.connection.readyState === 1) return;
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("❌ MONGO_URI not found in .env");
    await mongoose.connect(uri);
};

module.exports = connectDB;