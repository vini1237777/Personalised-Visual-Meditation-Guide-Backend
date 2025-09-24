import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import "dotenv/config";

// ROUTES
import { userRoutes } from "./routes/userRoutes";
import { authRoutes } from "./routes/authRoutes";
import { scriptRoutes } from "./routes/scriptGenerator";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = [
  "http://localhost:3000",
  "https://d3jpf9la46kzt4.cloudfront.net/",
];
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/api/user", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/script", scriptRoutes);

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.warn("MONGODB_URI is not set. API will run, DB will be DOWN.");
} else {
  mongoose
    .connect(mongoUri, {})
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.error("Error connecting to MongoDB:", err));
}

export default app;
