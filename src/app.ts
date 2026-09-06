import cookieParser from "cookie-parser";
import cors from "cors";
import type { Application, Request, Response } from "express";
import express from "express";
import passport from "passport";
import config from "./config/index.js";
import { globalErrorHandler } from "./middleware/globalErrorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { authRoutes } from "./module/auth/auth.route.js";
import "./config/passport.js";
import { ambulanceRoutes } from "./module/ambulances/ambulance.routes.js";
import { driverRoutes } from "./module/drivers/driver.routes.js";
import { emergencyRoutes } from "./module/emergencies/emergency.routes.js";

const app: Application = express();

app.use(
	cors({
		origin: config.app_url,
		credentials: true,
	}),
);

app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(passport.initialize());

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/emergencies", emergencyRoutes);
app.use("/api/v1/ambulances", ambulanceRoutes);
app.use("/api/v1/drivers", driverRoutes);

app.get("/", (req: Request, res: Response) => {
	res.status(200).json({
		success: true,
		message: "Welcome to LifeDispatch API",
	});
});

// Error handlers
app.use(notFound);
app.use(globalErrorHandler);

export default app;
