const app = require('./app');
const config = require('./config/env');
const { connectDB } = require('./config/db');
const { startScheduler } = require('./services/scheduler');

async function bootstrap() {
  await connectDB();
  
  startScheduler();

  const server = app.listen(config.PORT, () => {
    console.log(`=======================================================`);
    console.log(`RecoverTrack API Server running on port ${config.PORT}`);
    console.log(`Environment: ${config.NODE_ENV}`);
    console.log(`Client URL:  ${config.CLIENT_URL}`);
    console.log(`ML URL:      ${config.ML_SERVICE_URL}`);
    console.log(`Disclaimer:  This app is a reminder and record-keeping tool. It does not give medical advice.`);
    console.log(`=======================================================`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
    });
  });
}

bootstrap();
