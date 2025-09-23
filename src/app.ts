// src/app.ts
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";

// ROUTES
import { userRoutes } from "./routes/userRoutes";
import { authRoutes } from "./routes/authRoutes";
import { scriptRoutes } from "./routes/scriptGenerator";

const allowedOrigins = ["http://localhost:3000/", process.env.WEB_ORIGIN];
const app = express();

// app.use(
//   cors({
//     origin(origin, cb) {
//       if (!origin) return cb(null, true);
//       cb(null, allowedOrigins.includes(origin));
//     },
//     methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//     credentials: true,
//   })
// );
// app.options("*", cors());

const corsOptions = {
  origin: function (origin: any, callback: any) {
    // Check if the requesting origin is in the allowedOrigins array
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true); // Allow the request
    } else {
      callback(new Error("Not allowed by CORS")); // Deny the request
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // Allow sending cookies/authorization headers
  optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

// Use the CORS middleware with your configured options
app.use(cors(corsOptions));

// app.options("*", (req, res) => {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
//   res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
//   res.sendStatus(200);
// });

// /** ---- Core middleware ---- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST || "0.0.0.0"; // bind all interfaces for EC2
app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});

export default app;
