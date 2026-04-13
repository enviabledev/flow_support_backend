const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Store uploads in /app/uploads inside the container
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB max (WhatsApp/Twilio limit)
  fileFilter: (req, file, cb) => {
    // Allow images, audio, video, documents
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/amr', 'audio/aac',
      'audio/opus', 'audio/wav', 'audio/x-m4a', 'audio/mp3',
      'video/mp4', 'video/3gpp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, true); // Accept all for now, Twilio will validate
    }
  }
});

router.post('/', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const baseUrl = process.env.WEBHOOK_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

  res.json({
    url: fileUrl,
    filename: req.file.filename,
    originalName: req.file.originalname,
    contentType: req.file.mimetype,
    size: req.file.size,
  });
});

module.exports = router;
