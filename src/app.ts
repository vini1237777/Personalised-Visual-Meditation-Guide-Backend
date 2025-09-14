require("dotenv").config();
import express from "express";
import mongoose from "mongoose";
const app = express();
import { userRoutes } from "./routes/userRoutes";
import { authRoutes } from "./routes/authRoutes";
import cors from "cors";
import { scriptRoutes } from "./routes/scriptGenerator";
// import { createScript } from "./services/scriptService";
// import bodyParser from "body-parser";

// For parsing application/json
app.use(express.json());

// For parsing application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

app.use(cors());

app.use(
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.header(
      "Access-Control-Allow-Methods",
      "OPTIONS, GET, POST, PUT, PATCH, DELETE"
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept," + " Authorization,"
    );
    res.header("Access-Control-Allow-origin", "*");
    next();
  }
);

app.use("/api/user", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/script", scriptRoutes);

app.use(express.json());
// app.use(bodyParser.urlencoded({ extended: false }));
// app.use(bodyParser.json());

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error("MONGODB_URI environment variable is not defined.");
}

mongoose
  .connect(mongoUri)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err: any) => console.error("MongoDB connection error:", err));

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

// const selectedFeelings = ["warmth"];
// const selectedEmojis = ["😀"];

// const res = createScript({ selectedFeelings, selectedEmojis })
//   .then((res) => {
//     console.log(res);
//   })
//   .then((result) => {
//     console.log(result);
//   })
//   .catch((error) => console.log(error));
