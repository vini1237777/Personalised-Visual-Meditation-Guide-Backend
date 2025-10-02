import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import "dotenv/config";

import { userRoutes } from "./routes/userRoutes";
import { authRoutes } from "./routes/authRoutes";
import { scriptRoutes } from "./routes/scriptGenerator";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = Number(process.env.PORT) || 3000;

const allowedOrigins = [
  "http://localhost:3000/",
  "http://localhost:4000/",
  "http://16.112.14.253/",
];
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

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

app.listen(port, () => {
  console.log(`API listening on http://${port}.`);
});

export default app;
