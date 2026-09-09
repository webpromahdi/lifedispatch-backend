import type { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../lib/cloudinary.js";

export const uploadToCloudinary = (
	buffer: Buffer,
	folder: string,
): Promise<UploadApiResponse> => {
	return new Promise((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{
				folder,
				resource_type: "auto",
			},
			(error, result) => {
				if (error || !result) return reject(error);
				resolve(result);
			},
		);
		stream.end(buffer);
	});
};
