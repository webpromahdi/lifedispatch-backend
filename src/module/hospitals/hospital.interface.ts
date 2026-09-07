import type { HospitalDiversionStatus } from "../../../generated/prisma/enums.js";

export interface ICreateHospitalPayload {
	name: string;
	address: string;
	lat: number;
	lng: number;
	phone: string;
	emergencyContact: string;
	capabilities: string[];
	totalErBeds: number;
	availableErBeds: number;

	// First staff
	staffName: string;
	staffEmail: string;
	staffPhone?: string;
	staffPassword: string;
	staffDesignation?: string;
	staffEmployeeId?: string;
}

export interface IUpdateHospitalPayload {
	name?: string;
	address?: string;
	lat?: number;
	lng?: number;
	phone?: string;
	emergencyContact?: string;
	capabilities?: string[];
	totalErBeds?: number;
	availableErBeds?: number;
}

export interface IUpdateDiversionPayload {
	diversionStatus: HospitalDiversionStatus;
	diversionReason?: string;
	availableErBeds?: number;
}
