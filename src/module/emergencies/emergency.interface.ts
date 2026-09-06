import type {
	EmergencyType,
	RequiredCapability,
} from "../../../generated/prisma/enums.js";

export interface ICreateEmergencyPayload {
	emergencyType: EmergencyType;
	requiredCapability: RequiredCapability;
	description: string;
	locationAddress: string;
	locationLat: number;
	locationLng: number;
	callerName: string;
	callerPhone: string;
}
