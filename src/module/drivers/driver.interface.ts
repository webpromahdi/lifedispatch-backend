import type { CertificationLevel } from "../../../generated/prisma/enums.js";

export interface ICreateDriverPayload {
	name: string;
	email: string;
	phone?: string;
	password: string;
	licenseNumber: string;
	licenseExpiry: string;
	certificationLevel: CertificationLevel;
	assignedAmbulanceId?: string;
}

export interface IUpdateDriverPayload {
	licenseNumber?: string;
	licenseExpiry?: string;
	certificationLevel?: CertificationLevel;
	assignedAmbulanceId?: string | null;
}
