
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import userRouter from "./routes/user.routes.js";

const app = express();

// CORS configuration
app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}));

// Parse incoming JSON data
app.use(express.json({ limit: "16kb" }));

// Parse URL-encoded form data
app.use(express.urlencoded({
    extended: true,
    limit: "16kb"
}));

// Serve static files
app.use(express.static("public"));

// Parse cookies
app.use(cookieParser());

// User routes
app.use("/api/v1/users", userRouter);

export { app };
