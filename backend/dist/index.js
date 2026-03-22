"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = __importDefault(require("http"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const hotelRoutes_1 = __importDefault(require("./routes/hotelRoutes"));
const bookingRoutes_1 = __importDefault(require("./routes/bookingRoutes"));
const recommendationRoutes_1 = __importDefault(require("./routes/recommendationRoutes"));
const mapsRoutes_1 = __importDefault(require("./routes/mapsRoutes"));
const paymentRoutes_1 = __importDefault(require("./routes/paymentRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const preferencesRoutes_1 = __importDefault(require("./routes/preferencesRoutes"));
const realtime_1 = require("./realtime");
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
(0, realtime_1.attachSocketIO)(server, process.env.FRONTEND_ORIGIN || "*");
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_ORIGIN || "*",
    credentials: true
}));
app.use(express_1.default.json());
app.use((0, morgan_1.default)("dev"));
app.use("/api/auth", authRoutes_1.default);
app.use("/api", hotelRoutes_1.default);
app.use("/api", bookingRoutes_1.default);
app.use("/api", recommendationRoutes_1.default);
app.use("/api", mapsRoutes_1.default);
app.use("/api", paymentRoutes_1.default);
app.use("/api", preferencesRoutes_1.default);
app.use("/api", adminRoutes_1.default);
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
const port = process.env.PORT || 4000;
server.listen(port, () => {
    console.log(`Backend API listening on port ${port}`);
});
