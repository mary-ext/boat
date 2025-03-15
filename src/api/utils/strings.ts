import type { Records } from '@atcute/client/lexicons';

export const DID_OR_HANDLE_RE =
	/^[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)*(?:\.[a-zA-Z]{2,})$|^did:[a-z]+:[a-zA-Z0-9._:%\-]*[a-zA-Z0-9._\-]$/;

export const makeAtUri = (repo: string, collection: keyof Records | (string & {}), rkey: string) => {
	return `at://${repo}/${collection}/${rkey}`;
};
