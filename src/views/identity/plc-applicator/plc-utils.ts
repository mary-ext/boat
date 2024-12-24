import * as CBOR from '@atcute/cbor';
import { verifySignature } from '@atproto/crypto';
import * as uint8arrays from 'uint8arrays';

import { PlcLogEntry, PlcUpdatePayload } from '~/api/types/plc';
import { UnwrapArray } from '~/api/utils/types';

import { assert } from '~/lib/utils/invariant';

export const getPlcPayload = (entry: PlcLogEntry): PlcUpdatePayload => {
	const op = entry.operation;
	assert(op.type === 'plc_operation' || op.type === 'create');

	if (op.type === 'create') {
		return {
			alsoKnownAs: [`at://${op.handle}`],
			rotationKeys: [op.recoveryKey, op.signingKey],
			verificationMethods: {
				atproto: op.signingKey,
			},
			services: {
				atproto_pds: {
					type: 'AtprotoPersonalDataServer',
					endpoint: op.service,
				},
			},
		};
	} else if (op.type === 'plc_operation') {
		return {
			alsoKnownAs: op.alsoKnownAs,
			rotationKeys: op.rotationKeys,
			services: op.services,
			verificationMethods: op.verificationMethods,
		};
	}

	assert(false);
};

export const getPlcKeying = async (logs: PlcLogEntry[]) => {
	logs = logs.filter((entry) => !entry.nullified);

	const length = logs.length;
	const promises = logs.map(async (entry, idx) => {
		const operation = entry.operation;
		if (operation.type === 'plc_tombstone') {
			return;
		}

		// If it's not the last entry, check if the next entry ahead of this one
		// was made within the last 72 hours.
		if (idx !== length - 1) {
			const next = logs[idx + 1]!;
			const date = new Date(next.createdAt);
			const diff = Date.now() - date.getTime();

			if (diff / (1_000 * 60 * 60) > 72) {
				return;
			}
		}

		/** keys that potentially signed this operation */
		let signers: string[] | undefined;
		if (operation.prev === null) {
			if (operation.type === 'create') {
				signers = [operation.recoveryKey, operation.signingKey];
			} else if (operation.type === 'plc_operation') {
				signers = operation.rotationKeys;
			}
		} else {
			const prev = logs[idx - 1];
			assert(prev !== undefined, `missing previous entry from ${entry.createdAt}`);
			assert(prev.cid === operation.prev, `prev cid mismatch on ${entry.createdAt}`);

			const prevOp = prev.operation;

			if (prevOp.type === 'create') {
				signers = [prevOp.recoveryKey, prevOp.signingKey];
			} else if (prevOp.type === 'plc_operation') {
				signers = prevOp.rotationKeys;
			}
		}

		assert(signers !== undefined, `no signers found for ${entry.createdAt}`);

		const opBytes = CBOR.encode({ ...operation, sig: undefined });
		const sigBytes = uint8arrays.fromString(operation.sig, 'base64url');

		/** key that signed this operation */
		let signedBy: string | undefined;
		for (const key of signers) {
			const valid = await verifySignature(key, opBytes, sigBytes);
			if (valid) {
				signedBy = key;
				break;
			}
		}

		assert(signedBy !== undefined, `no valid signer for ${entry.createdAt}`);

		return {
			...entry,
			signers,
			signedBy,
		};
	});

	const fulfilled = await Promise.all(promises);
	return fulfilled.filter((entry) => entry !== undefined);
};

type DetailedEntries = Awaited<ReturnType<typeof getPlcKeying>>;
export type DetailedPlcEntry = UnwrapArray<DetailedEntries>;

export const getCurrentSignersFromEntry = (entry: PlcLogEntry): string[] => {
	const operation = entry.operation;

	/** keys that can sign the next operation */
	let nextSigners: string[] | undefined;
	if (operation.type === 'create') {
		nextSigners = [operation.recoveryKey, operation.signingKey];
	} else if (operation.type === 'plc_operation') {
		nextSigners = operation.rotationKeys;
	}

	assert(nextSigners !== undefined, `no signers found for ${entry.createdAt}`);
	return nextSigners;
};
