import type { AtprotoDid, DidDocument } from '@atcute/identity';
import {
	CompositeDidDocumentResolver,
	PlcDidDocumentResolver,
	WebDidDocumentResolver,
} from '@atcute/identity-resolver';

const didDocumentResolver = new CompositeDidDocumentResolver({
	methods: {
		plc: new PlcDidDocumentResolver(),
		web: new WebDidDocumentResolver(),
	},
});

export const getDidDocument = async ({
	did,
	signal,
}: {
	did: AtprotoDid;
	signal?: AbortSignal;
}): Promise<DidDocument> => {
	return didDocumentResolver.resolve(did, { signal });
};
