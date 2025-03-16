import type { IndexedEntry } from '@atcute/did-plc';

import { UpdatePayload } from '~/api/types/plc';

import { assert } from '~/lib/utils/invariant';

export const getPlcPayload = (entry: IndexedEntry): UpdatePayload => {
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
