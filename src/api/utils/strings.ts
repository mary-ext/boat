import type { At, Records } from '@atcute/client/lexicons';

import { assert } from '~/lib/utils/invariant';

export const ATURI_RE =
	/^at:\/\/(did:[a-zA-Z0-9._:%\-]+|[a-zA-Z0-9-.]+)\/([a-zA-Z0-9-.]+)\/([a-zA-Z0-9._~:@!$&%')(*+,;=\-]+)(?:#(\/[a-zA-Z0-9._~:@!$&%')(*+,;=\-[\]/\\]*))?$/;

export const DID_RE = /^did:([a-z]+):([a-zA-Z0-9._:%\-]*[a-zA-Z0-9._\-])$/;

export const DID_WEB_RE = /^did:web:([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*(?:\.[a-zA-Z]{2,}))$/;

export const DID_PLC_RE = /^did:plc:([a-z2-7]{24})$/;

export const DID_KEY_RE = /^did:key:z[a-km-zA-HJ-NP-Z1-9]+$/;

export const HANDLE_RE = /^[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)*(?:\.[a-zA-Z]{2,})$/;

export const DID_OR_HANDLE_RE =
	/^[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)*(?:\.[a-zA-Z]{2,})$|^did:[a-z]+:[a-zA-Z0-9._:%\-]*[a-zA-Z0-9._\-]$/;

export interface AtUri {
	repo: string;
	collection: string;
	rkey: string;
	fragment: string | undefined;
}

export const isDid = (value: string): value is At.DID => {
	return DID_RE.test(value);
};

export const parseAtUri = (str: string): AtUri => {
	const match = ATURI_RE.exec(str);
	assert(match !== null, `Failed to parse AT URI for ${str}`);

	return {
		repo: match[1],
		collection: match[2],
		rkey: match[3],
		fragment: match[4],
	};
};

export const makeAtUri = (repo: string, collection: keyof Records | (string & {}), rkey: string) => {
	return `at://${repo}/${collection}/${rkey}`;
};
