import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import http from "http";
import authRoutes from "./routes/authRoutes";
import hotelRoutes from "./routes/hotelRoutes";
import bookingRoutes from "./routes/bookingRoutes";
import recommendationRoutes from "./routes/recommendationRoutes";
import mapsRoutes from "./routes/mapsRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import adminRoutes from "./routes/adminRoutes";
import preferencesRoutes from "./routes/preferencesRoutes";
import { Server as SocketIOServer } from "socket.io";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: {
        origin: process.env.FRONTEND_ORIGIN || "*",
        methods: ["GET", "POST", "PATCH", "DELETE"]
    }
});

app.use(
    cors({
        origin: process.env.FRONTEND_ORIGIN || "*",
        credentials: true
    })
);
app.use(express.json());
app.use(morgan("dev"));

app.use("/api/auth", authRoutes);
app.use("/api", hotelRoutes);
app.use("/api", bookingRoutes);
app.use("/api", recommendationRoutes);
app.use("/api", mapsRoutes);
app.use("/api", paymentRoutes);
app.use("/api", preferencesRoutes);
app.use("/api", adminRoutes);

app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

io.on("connection", (socket) => {
    // Placeholder for booking/availability events
    console.log("Socket connected", socket.id);
});

const port = process.env.PORT || 4000;

server.listen(port, () => {
    console.log(`Backend API listening on port ${port}`);
});
