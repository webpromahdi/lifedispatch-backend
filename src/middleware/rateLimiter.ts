import type { Request } from "express";
import rateLimit from "express-rate-limit";

interface IRateLimiterOptions {
	windowMs?: number;
	max?: number;
	message?: string;
	keyBy?: "ip" | "user";
}

export const rateLimiter = ({
	windowMs = 60_000,
	max = 10,
	message = "Too many requests. Please slow down and try again later.",
	keyBy = "ip",
}: IRateLimiterOptions = {}) => {
	return rateLimit({
		windowMs,
		max,
		standardHeaders: true,
		legacyHeaders: false,
		validate: { xForwardedForHeader: false },

		keyGenerator: (req: Request): string => {
			if (keyBy === "user") {
				// req.user is populated by auth middleware
				return req.user?.userId ?? req.ip ?? "anonymous";
			}
			return req.ip ?? "unknown";
		},

		handler: (_req, res) => {
			res.status(429).json({
				success: false,
				statusCode: 429,
				message,
			});
		},
	});
};
