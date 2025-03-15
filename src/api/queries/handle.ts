import { type AtprotoDid, type Handle, isHandle } from '@atcute/identity';
import { XrpcHandleResolver } from '@atcute/identity-resolver';

const handleResolver = new XrpcHandleResolver({
	serviceUrl: import.meta.env.VITE_APPVIEW_URL,
});

export const resolveHandleViaAppView = async ({
	handle,
	signal,
}: {
	handle: Handle;
	signal?: AbortSignal;
}): Promise<AtprotoDid> => {
	if (!isHandle(handle)) {
		throw new Error(`invalid handle: ${handle}`);
	}

	return await handleResolver.resolve(handle, { signal });
};

export const resolveHandleViaPds = async ({
	service,
	handle: handle,
	signal,
}: {
	service: string;
	handle: Handle;
	signal?: AbortSignal;
}): Promise<AtprotoDid> => {
	const resolver = new XrpcHandleResolver({ serviceUrl: service });

	return await resolver.resolve(handle, { signal });
};
