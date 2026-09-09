import type { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../lib/cloudinary.js";

export const uploadToCloudinary = (
	buffer: Buffer,
	folder: string,
	resourceType: "image" | "video" | "raw" | "auto" = "auto",
	originalName?: string,
): Promise<UploadApiResponse> => {
	return new Promise((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{
				folder,
				resource_type: resourceType,
				// Preserve the original filename (including extension like .pdf)
				...(originalName && {
					use_filename: true,
					unique_filename: true,
					filename_override: originalName,
				}),
			},
			(error, result) => {
				if (error || !result) return reject(error);
				resolve(result);
			},
		);
		stream.end(buffer);
	});
};
