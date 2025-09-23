// src/app.ts
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";

// ROUTES
import { userRoutes } from "./routes/userRoutes";
import { authRoutes } from "./routes/authRoutes";
import { scriptRoutes } from "./routes/scriptGenerator";

const app = express();

/** ---- Core middleware ---- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/** ---- CORS ----
 * Set WEB_ORIGIN to your frontend origin:
 *   e.g. https://hjvdjwhe74638.cloudfront.net  (or your custom domain)
 * If you want multiple allowed origins, see the array version below.
 */
// const WEB_ORIGIN = process.env.WEB_ORIGIN;
// if (!WEB_ORIGIN) {
//   console.warn("WEB_ORIGIN not set. CORS will allow no origins.");
// }
app.use(
  cors({
    origin: "https://d3jpf9la46kzt4.cloudfront.net", // your CF domain (or your custom domain)
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
  })
);

// app.options(
//   "*",
//   cors({
//     origin: "https://d3jpf9la46kzt4.cloudfront.net", // your CF domain (or your custom domain)
//     methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
//     credentials: true,
//   })
// );

/** If you WANT multiple origins, use this instead of the cors() above:
const allow = (process.env.WEB_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean); // e.g. "https://app.example.com,https://hjvdjwhe74638.cloudfront.net"

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allow.includes(origin)) return cb(null, true);
    return cb(new Error('CORS: origin not allowed'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','Accept'],
}));
*/

/** ---- Routes ---- */
app.get("/api/health", (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(200).json({ ok: true, db: dbUp ? "up" : "down" });
});

app.use("/api/user", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/script", scriptRoutes);

/** ---- MongoDB ---- */
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error("MONGODB_URI is not set");
}
mongoose
  .connect("mongodb://localhost/mydatabase", {})
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
  });
/** ---- Server ---- */
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0"; // bind all interfaces for EC2
app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});

export default app;
