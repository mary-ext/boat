import * as v from '@badrap/valita';

import { DID_KEY_RE, DID_RE, HANDLE_RE } from '../utils/strings';

export const didString = v
	.string()
	.assert((input): input is `did:${string}:${string}` => DID_RE.test(input), `must be a valid did`);

export const didKeyString = v
	.string()
	.assert((input): input is `did:key:${string}` => DID_KEY_RE.test(input), `must be a valid did:key`);

export const handleString = v.string().assert((input) => HANDLE_RE.test(input), `must be a valid handle`);

export const urlString = v.string().assert((input) => URL.canParse(input), `must be a valid url`);

export const serviceUrlString = v.string().assert((input) => {
	const url = URL.parse(input);

	return (
		url !== null &&
		(url.protocol === 'https:' || url.protocol === 'http:') &&
		url.pathname === '/' &&
		url.search === '' &&
		url.hash === ''
	);
}, `must be a valid atproto service url`);

export const isServiceUrlString = (str: string) => {
	const result = serviceUrlString.try(str);
	return result.ok;
};
