const express = require("express");
const fs = require("fs");
const { getPublicPath } = require("../utils/paths");

function createScreensaverRouter({ backendUrl }) {
  const router = express.Router();

  router.get("/api/screensavers", (req, res) => {
    try {
      const folder = getPublicPath("imgs", "screensavers");
      const files = fs.readdirSync(folder).filter((f) => !f.startsWith("."));
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

  return router;
}

module.exports = { createScreensaverRouter };
