import { Application, Request, Response } from "express";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import config from "./config/index.js";



const app: Application = express();

app.use(
  cors({
    origin: config.app_url,
    credentials: true,
  }),
);

app.get("/", (req : Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Welcome to LifeDispatch API",
  });
});

app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


export default app;
