import { assert } from '~/lib/utils/invariant';

type Did<TMethod extends string = string> = `did:${TMethod}:${string}`;

type Nsid = `${string}.${string}.${string}`;

type RecordKey = string;

const DID_RE = /^did:([a-z]+):([a-zA-Z0-9._:%\-]*[a-zA-Z0-9._\-])$/;

const NSID_RE =
	/^[a-zA-Z](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?:\.[a-zA-Z](?:[a-zA-Z0-9]{0,62})?)$/;

const RECORD_KEY_RE = /^(?!\.{1,2}$)[a-zA-Z0-9_~.:-]{1,512}$/;

const ATURI_RE =
	/^at:\/\/([a-zA-Z0-9._:%-]+)(?:\/([a-zA-Z0-9-.]+)(?:\/([a-zA-Z0-9._~:@!$&%')(*+,;=-]+))?)?(?:#(\/[a-zA-Z0-9._~:@!$&%')(*+,;=\-[\]/\\]*))?$/;

const isDid = (input: unknown): input is Did => {
	return typeof input === 'string' && input.length >= 7 && input.length <= 2048 && DID_RE.test(input);
};

const isNsid = (input: unknown): input is Nsid => {
	return typeof input === 'string' && input.length >= 5 && input.length <= 317 && NSID_RE.test(input);
};

const isRecordKey = (input: unknown): input is RecordKey => {
	return typeof input === 'string' && input.length >= 1 && input.length <= 512 && RECORD_KEY_RE.test(input);
};

export interface AddressedAtUri {
	repo: Did;
	collection: Nsid;
	rkey: string;
	fragment: string | undefined;
}

export const parseAddressedAtUri = (str: string): AddressedAtUri => {
	const match = ATURI_RE.exec(str);
	assert(match !== null, `invalid addressed-at-uri: ${str}`);

	const [, r, c, k, f] = match;
	assert(isDid(r), `invalid repo in addressed-at-uri: ${r}`);
	assert(isNsid(c), `invalid collection in addressed-at-uri: ${c}`);
	assert(isRecordKey(k), `invalid rkey in addressed-at-uri: ${k}`);

	return {
		repo: r,
		collection: c,
		rkey: k,
		fragment: f,
	};
};
