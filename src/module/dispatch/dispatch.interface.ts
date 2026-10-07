export interface IRecommendPayload {
	emergencyId: string;
}

export interface ICreateDispatchPayload {
	emergencyId: string;
	ambulanceId: string;
	dispatchScore?: number;
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
	/** Feature 4: true when the ambulance's nextServiceDue has passed.
	 *  Dispatch is still allowed but the dispatcher is warned. */
	serviceOverdue?: boolean;
}
