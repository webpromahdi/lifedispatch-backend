import type { Request } from "express";
import multer from "multer";
import path from "path";

// Set up Multer for handling file uploads
const storage = multer.memoryStorage();

const allowedMimeTypes = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"application/pdf",
];

const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

const fileFilter = (
	_req: Request,
	file: Express.Multer.File,
	cb: multer.FileFilterCallback,
) => {
	const ext = path.extname(file.originalname).toLowerCase();
	const isMimeAllowed = allowedMimeTypes.includes(file.mimetype);
	const isExtAllowed = allowedExtensions.includes(ext);

	if (isMimeAllowed || isExtAllowed) {
		cb(null, true);
	} else {
		cb(
			new Error("Invalid file type. Only JPG, PNG, WEBP, and PDF are allowed."),
		);
	}
};

export const upload = multer({
	storage,
	fileFilter,
	limits: {
		fileSize: 5 * 1024 * 1024,
	},
});
