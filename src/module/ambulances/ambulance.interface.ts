import type {
	AmbulanceStatus,
	AmbulanceType,
} from "../../../generated/prisma/enums.js";

export interface ICreateAmbulancePayload {
	registrationNumber: string;
	type: AmbulanceType;
	capabilities: string[];
	baseLocationLat: number;
	baseLocationLng: number;
	hospitalId?: string;
	lastServiceDate?: string;
	nextServiceDue?: string;
	manufacturedYear?: number;
}

export interface IUpdateAmbulancePayload {
	registrationNumber?: string;
	type?: AmbulanceType;
	capabilities?: string[];
	baseLocationLat?: number;
	baseLocationLng?: number;
	hospitalId?: string | null;
	currentLat?: number;
	currentLng?: number;
	lastServiceDate?: string;
	nextServiceDue?: string;
	manufacturedYear?: number;
}

export interface IUpdateAmbulanceStatusPayload {
	status: AmbulanceStatus;
}
