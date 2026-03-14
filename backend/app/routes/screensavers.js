const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { getPublicPath } = require("../utils/paths");

function createScreensaverRouter({ backendUrl }) {
  const router = express.Router();
  const screensaverDir = getPublicPath("imgs", "screensavers");

  if (!fs.existsSync(screensaverDir)) {
    fs.mkdirSync(screensaverDir, { recursive: true });
  }

  const screensaverUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, screensaverDir),
      filename: (_req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase() || ".png";
        const baseName = path
          .basename(file.originalname, path.extname(file.originalname))
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 80);
        const timestamp = Date.now();

        cb(null, `${baseName || "screensaver"}-${timestamp}${extension}`);
      },
    }),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      cb(null, file.mimetype.startsWith("image/"));
    },
  });

  router.get("/api/screensavers", (req, res) => {
    try {
      const files = fs.readdirSync(screensaverDir).filter((f) => !f.startsWith("."));
      const index = Math.floor(Math.random() * files.length);
      res.json({
        images: files.map((img) => `${backendUrl}/imgs/screensavers/${img}`),
        index,
      });
    } catch (error) {
      console.error("Screensaver API crashed:", error.message);
      res.status(500).json({ error: "Failed to load screensavers" });
    }
  });

  router.post(
    "/api/screensavers",
    authenticateToken,
    requireAdmin,
    screensaverUpload.single("file"),
    (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "Image file is required." });
        }

        return res.json({
          success: true,
          image: `${backendUrl}/imgs/screensavers/${req.file.filename}`,
          filename: req.file.filename,
        });
      } catch (error) {
        console.error("Screensaver upload failed:", error.message);
        return res.status(500).json({ error: "Failed to upload screensaver." });
      }
    },
  );

  return router;
}

module.exports = { createScreensaverRouter };
