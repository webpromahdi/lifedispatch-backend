import type { Request, Response } from "express";
import httpStatus from "http-status";
import {
	AmbulanceStatus,
	AmbulanceType,
} from "../../../generated/prisma/enums.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { uploadToCloudinary } from "../../utils/uploadToCloudinary.js";
import { ambulanceService } from "./ambulance.service.js";

const VALID_STATUSES = Object.values(AmbulanceStatus);
const VALID_TYPES = Object.values(AmbulanceType);

function isValidEnum<T extends string>(
	value: string,
	allowed: T[],
): value is T {
	return allowed.includes(value as T);
}

const createAmbulance = catchAsync(async (req: Request, res: Response) => {
	let registrationDocumentUrl: string | undefined;

	if (req.file) {
		const uploaded = await uploadToCloudinary(
			req.file.buffer,
			"lifedispatch/ambulances",
			"raw",
			req.file.originalname,
		);
		registrationDocumentUrl = uploaded.secure_url;
	}

	const payload = {
		...req.body,
		...(registrationDocumentUrl && { registrationDocumentUrl }),
	};

	const ambulance = await ambulanceService.createAmbulanceIntoDB(payload);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Ambulance registered successfully.",
		data: ambulance,
	});
});

const getAllAmbulances = catchAsync(async (req: Request, res: Response) => {
	const page = Math.max(1, Number(req.query.page) || 1);
	const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

	const filters: {
		status?: AmbulanceStatus;
		type?: AmbulanceType;
	} = {};

	let hasInvalidFilter = false;

	if (typeof req.query.status === "string" && req.query.status !== "") {
		if (isValidEnum(req.query.status, VALID_STATUSES)) {
			filters.status = req.query.status;
		} else {
			hasInvalidFilter = true;
		}
	}

	if (typeof req.query.type === "string" && req.query.type !== "") {
		if (isValidEnum(req.query.type, VALID_TYPES)) {
			filters.type = req.query.type;
		} else {
			hasInvalidFilter = true;
		}
	}

	if (hasInvalidFilter) {
		return sendResponse(res, {
			success: true,
			statusCode: httpStatus.OK,
			message: "Ambulances retrieved successfully.",
			data: [],
			meta: { page, limit, total: 0, totalPages: 0 },
		});
	}

	const result = await ambulanceService.getAllAmbulancesFromDB(
		page,
		limit,
		filters,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Ambulances retrieved successfully.",
		data: result.ambulances,
		meta: result.meta,
	});
});

const getAmbulanceById = catchAsync(async (req: Request, res: Response) => {
	const { id } = req.params;

	const ambulance = await ambulanceService.getAmbulanceById(id as string);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Ambulance details retrieved successfully.",
		data: ambulance,
	});
});

const updateAmbulance = catchAsync(async (req: Request, res: Response) => {
	const { id } = req.params;
	const payload = req.body;

	const ambulance = await ambulanceService.updateAmbulanceInDB(
		id as string,
		payload,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Ambulance updated successfully.",
		data: ambulance,
	});
});

const updateAmbulanceStatus = catchAsync(
	async (req: Request, res: Response) => {
		const { id } = req.params;
		const { status } = req.body;
		const requesterId = req.user!.userId;
		const requesterRole = req.user!.role;

		const ambulance = await ambulanceService.updateAmbulanceStatusInDB(
			id as string,
			status,
			requesterId,
			requesterRole,
		);

		sendResponse(res, {
			success: true,
			statusCode: httpStatus.OK,
			message: "Ambulance status updated successfully.",
			data: ambulance,
		});
	},
);

export const ambulanceController = {
	createAmbulance,
	getAllAmbulances,
	getAmbulanceById,
	updateAmbulance,
	updateAmbulanceStatus,
};
