const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config/env');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profiles');
const scheduleRoutes = require('./routes/schedules');
const doseRoutes = require('./routes/doses');
const scanRoutes = require('./routes/scan');
const riskRoutes = require('./routes/risk');
const reminderRoutes = require('./routes/reminders');
const auditRoutes = require('./routes/audit');

const app = express();

// Security Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const allowedOrigins = [
  config.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-ml-secret']
}));

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'recovertrack-server',
    time: new Date().toISOString(),
    disclaimer: 'This app is a reminder and record-keeping tool. It does not give medical advice.'
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/doses', doseRoutes);
app.use('/api/prescriptions', scanRoutes);
app.use('/api/risk', riskRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/audit', auditRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[RecoverTrack Error Handler]:', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
    code: err.code || 'INTERNAL_ERROR'
  });
});

module.exports = app;
