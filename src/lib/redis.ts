import { createClient } from "redis";
import config from "../config/index.js";

export const redisClient = createClient({
	username: config.redis_user,
	password: config.redis_password,
	socket: {
		host: config.redis_host,
		port: Number(config.redis_port),
	},
});

// Prevent unhandled 'error' events from crashing the process
redisClient.on("error", (err: Error) => {
	console.error("[Redis] Connection error:", err.message);
});

redisClient.on("reconnecting", () => {
	console.warn("[Redis] Reconnecting...");
});

// Automatically connect in serverless environments
redisClient.connect().catch((err) => {
	console.error("[Redis] Failed to connect on startup:", err);
});
