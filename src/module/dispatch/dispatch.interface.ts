export interface IRecommendPayload {
	emergencyId: string;
}

export interface ICreateDispatchPayload {
	emergencyId: string;
	ambulanceId: string;
}

export interface IRejectDispatchPayload {
	reason: string;
}

export interface ICancelDispatchPayload {
	reason: string;
}

export interface IAmbulanceCandidate {
	ambulanceId: string;
	registrationNumber: string;
	type: string;
	capabilities: string[];
	driverId: string;
	driverName: string;
	driverCertificationLevel: string;
	distanceKm: number;
	score: number;
	scoreBreakdown: {
		distanceScore: number;
		priorityScore: number;
		typeScore: number;
	};
}
