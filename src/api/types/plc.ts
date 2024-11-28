import * as v from 'valibot';

import { didKeyString, didString, handleString, serviceUrlString } from './strings';

export const legacyGenesisOp = v.object({
	type: v.literal('create'),
	signingKey: didKeyString,
	recoveryKey: didKeyString,
	handle: handleString,
	service: serviceUrlString,
	prev: v.null(),
	sig: v.string(),
});
export type PlcLegacyGenesisOp = v.InferOutput<typeof legacyGenesisOp>;

export const tombstoneOp = v.object({
	type: v.literal('plc_tombstone'),
	prev: v.string(),
	sig: v.string(),
});
export type PlcTombstoneOp = v.InferOutput<typeof tombstoneOp>;

export const service = v.object({
	type: v.string(),
	endpoint: v.pipe(v.string(), v.url()),
});
export type Service = v.InferOutput<typeof service>;

const updateOp = v.object({
	type: v.literal('plc_operation'),
	rotationKeys: v.array(didKeyString),
	verificationMethods: v.record(v.string(), didKeyString),
	alsoKnownAs: v.array(v.pipe(v.string(), v.url())),
	services: v.record(
		v.string(),
		v.object({
			type: v.string(),
			endpoint: v.pipe(v.string(), v.url()),
		}),
	),
	prev: v.nullable(v.string()),
	sig: v.string(),
});
export type PlcUpdateOp = v.InferOutput<typeof updateOp>;

export const plcOperation = v.union([legacyGenesisOp, tombstoneOp, updateOp]);
export type PlcOperation = v.InferOutput<typeof plcOperation>;

export const plcLogEntry = v.object({
	did: didString,
	cid: v.string(),
	operation: plcOperation,
	nullified: v.boolean(),
	createdAt: v.pipe(
		v.string(),
		v.check((dateString) => {
			const date = new Date(dateString);
			return !Number.isNaN(date.getTime());
		}),
	),
});
export type PlcLogEntry = v.InferOutput<typeof plcLogEntry>;

export const plcLogEntries = v.array(plcLogEntry);