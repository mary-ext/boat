import * as v from '@badrap/valita';

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
