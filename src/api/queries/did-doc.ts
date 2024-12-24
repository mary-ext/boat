import { At } from '@atcute/client/lexicons';

import { didDocument, DidDocument } from '../types/did-doc';
import { DID_PLC_RE, DID_WEB_RE } from '../utils/strings';

export const getDidDocument = async ({
	did,
	signal,
}: {
	did: At.DID;
	signal?: AbortSignal;
}): Promise<DidDocument> => {
	const colon_index = did.indexOf(':', 4);

	const type = did.slice(4, colon_index);
	const ident = did.slice(colon_index + 1);

	let rawDoc: any;

	if (type === 'plc') {
		if (!DID_PLC_RE.test(did)) {
			throw new Error(`invalid did:plc identifier`);
		}

		const origin = import.meta.env.VITE_PLC_DIRECTORY_URL;
		const response = await fetch(`${origin}/${did}`, { signal });

		if (response.status === 404) {
			throw new Error(`did not found in directory`);
		} else if (!response.ok) {
			throw new Error(`directory is unreachable`);
		}

		const json = await response.json();

		rawDoc = json;
	} else if (type === 'web') {
		if (!DID_WEB_RE.test(did)) {
			throw new Error(`invalid did:web identifier`);
		}

		const response = await fetch(`https://${ident}/.well-known/did.json`, { signal });

		if (!response.ok) {
			throw new Error(`did document is unreachable`);
		}

		const json = await response.json();

		rawDoc = json;
	} else {
		throw new Error(`unsupported did method`);
	}

	return didDocument.parse(rawDoc, { mode: 'passthrough' });
};
