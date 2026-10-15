const multer = require('multer');

// STRICT SAFETY RULE:
// Prescription images are processed in memory and never saved or logged.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, and WebP are allowed.`), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024 // 8 MB max
  },
  fileFilter
});

module.exports = upload;
