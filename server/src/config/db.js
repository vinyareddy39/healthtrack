const mongoose = require('mongoose');
const dns = require('dns');
const config = require('./env');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  try {
    const conn = await mongoose.connect(config.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    isConnected = true;
    console.log(`[MongoDB] Connected to database: ${conn.connection.name} @ ${conn.connection.host}`);
  } catch (err) {
    if (err.message.includes('querySrv') && config.MONGODB_URI.startsWith('mongodb+srv://')) {
      try {
        console.log('[MongoDB] Retrying connection with public DNS resolver (8.8.8.8)...');
        dns.setServers(['8.8.8.8', '1.1.1.1']);
        const conn = await mongoose.connect(config.MONGODB_URI, {
          serverSelectionTimeoutMS: 5000
        });
        isConnected = true;
        console.log(`[MongoDB] Connected to database: ${conn.connection.name} @ ${conn.connection.host}`);
        return;
      } catch (retryErr) {
        err = retryErr;
      }
    }
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
