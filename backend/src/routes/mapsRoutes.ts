import { Router } from "express";
import axios from "axios";

const router = Router();

const MAPS_BASE = "https://maps.googleapis.com/maps/api";

router.get("/maps/geocode", async (req, res) => {
  const { address } = req.query;
  const key = process.env.GOOGLE_MAPS_API_KEY;

  if (!key) {
    res.status(500).json({ error: "Maps API key not configured" });
    return;
  }

  if (!address || typeof address !== "string") {
    res.status(400).json({ error: "address query is required" });
    return;
  }

  try {
    const response = await axios.get(`${MAPS_BASE}/geocode/json`, {
      params: { address, key }
    });
    res.json(response.data);
  } catch {
    res.status(500).json({ error: "Failed to call Geocoding API" });
  }
});

router.get("/maps/directions", async (req, res) => {
  const { origin, destination } = req.query;
  const key = process.env.GOOGLE_MAPS_API_KEY;

  if (!key) {
    res.status(500).json({ error: "Maps API key not configured" });
    return;
  }

  if (
    !origin ||
    typeof origin !== "string" ||
    !destination ||
    typeof destination !== "string"
  ) {
    res
      .status(400)
      .json({ error: "origin and destination query parameters required" });
    return;
  }

  try {
    const response = await axios.get(`${MAPS_BASE}/directions/json`, {
      params: { origin, destination, key }
    });
    res.json(response.data);
  } catch {
    res.status(500).json({ error: "Failed to call Directions API" });
  }
});

export default router;

