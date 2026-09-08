export interface IUpdateTripStatusPayload {
	status: string;
	distanceKm?: number;
}

export interface ISelectHospitalPayload {
	hospitalId: string;
}

export interface ICompleteTripPayload {
	distanceKm: number;
	arrivedAtHospitalAt?: string;
}
