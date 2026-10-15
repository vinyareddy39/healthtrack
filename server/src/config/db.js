const mongoose = require('mongoose');
const config = require('./env');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  try {
    const conn = await mongoose.connect(config.MONGODB_URI, {
      serverSelectionTimeoutMS: 3000
    });
    isConnected = true;
    console.log(`[MongoDB] Connected to database: ${conn.connection.name} @ ${conn.connection.host}`);
  } catch (err) {
    console.warn(`[MongoDB] Warning: Could not connect to MongoDB at ${config.MONGODB_URI} (${err.message}).`);
    console.warn(`[MongoDB] If running without MongoDB container, please start MongoDB or run via docker-compose.`);
  }
}

async function disconnectDB() {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  mongoose
};
