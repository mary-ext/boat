import { type FileSystemFileHandle, showSaveFilePicker } from 'native-file-system-adapter';
import { createSignal } from 'solid-js';
import * as v from 'valibot';

import { At } from '@atcute/client/lexicons';
import { getPdsEndpoint } from '@atcute/client/utils/did';

import { getDidDocument } from '~/api/queries/did-doc';
import { resolveHandleViaAppView, resolveHandleViaPds } from '~/api/queries/handle';
import { serviceUrlString } from '~/api/types/strings';
import { DID_OR_HANDLE_RE, isDid } from '~/api/utils/strings';

import { useTitle } from '~/lib/navigation/router';
import { makeAbortable } from '~/lib/utils/abortable';
import { formatBytes } from '~/lib/utils/intl/bytes';

import Logger, { createLogger } from '~/components/logger';

const RepoExportPage = () => {
	const logger = createLogger();

	const [getSignal] = makeAbortable();
	const [pending, setPending] = createSignal(false);

	const mutate = async ({
		identifier,
		service,
		signal,
	}: {
		identifier: string;
		service?: string;
		signal?: AbortSignal;
	}) => {
		logger.info(`Starting export for ${identifier}`);

		let did: At.DID;
		if (isDid(identifier)) {
			did = identifier;
		} else if (service) {
			did = await resolveHandleViaPds({ service, handle: identifier, signal });
			logger.log(`Resolved handle to ${did}`);
		} else {
			did = await resolveHandleViaAppView({ handle: identifier, signal });
			logger.log(`Resolved handle to ${did}`);
		}

		if (!service) {
			const didDoc = await getDidDocument({ did, signal });
			logger.log(`Retrieved DID document`);

			const endpoint = getPdsEndpoint(didDoc);
			if (!endpoint) {
				logger.error(`Identity does not have a PDS server set`);
				return;
			}

			logger.log(`PDS located at ${endpoint}`);
			service = endpoint;
		}

		let fd: FileSystemFileHandle | undefined;

		{
			const progress = logger.progress(`Waiting for the user`);

			try {
				fd = await showSaveFilePicker({
					suggestedName: `${identifier}-${new Date().toISOString()}.car`,

					// @ts-expect-error: ponyfill doesn't have the full typings
					id: 'repo-export',
					startIn: 'downloads',
					types: [
						{
							description: 'CAR archive file',
							accept: { 'application/vnd.ipld.car': ['.car'] },
						},
					],
				}).catch((err) => {
					console.warn(err);

					if (err instanceof DOMException && err.name === 'AbortError') {
						logger.warn(`Opened the file picker, but it was aborted`);
					} else {
						logger.warn(`Something went wrong when opening the file picker`);
					}

					return undefined;
				});
			} finally {
				progress.destroy();
			}

			if (fd === undefined) {
				// We already handled the errors above
				return;
			}
		}

		const writable = await fd.createWritable();

		{
			const progress = logger.progress(`Downloading CAR file`);

			let size = 0;
			try {
				const repoUrl = new URL(`/xrpc/com.atproto.sync.getRepo?did=${did}`, service);
				const response = await fetch(repoUrl, { signal: signal });

				if (!response.ok || !response.body) {
					logger.error(`Failed to retrieve CAR file`);
					return;
				}

				for await (const chunk of iterateStream(response.body)) {
					size += chunk.length;
					writable.write(chunk);

					progress.update(`Downloading CAR file (${formatBytes(size)})`);
				}
			} finally {
				progress.destroy();
			}

			logger.log(`CAR file downloaded (${formatBytes(size)})`);
			await writable.close();

			logger.log(`Finished`);
		}
	};

	useTitle(() => `Export repository — boat`);

	return (
		<>
			<div class="p-4">
				<h1 class="text-lg font-bold text-purple-800">Export repository</h1>
				<p class="text-gray-600">Download an archive of an account's repository</p>
			</div>
			<hr class="mx-4 border-gray-200" />

			<form
				onSubmit={(ev) => {
					const formEl = ev.currentTarget;
					const formData = new FormData(formEl);
					ev.preventDefault();

					const signal = getSignal();

					const ident = formData.get('ident') as string;
					const service = formData.get('service') as string;

					const promise = mutate({
						identifier: ident,
						service: service || undefined,
						signal,
					});

					setPending(true);

					promise.then(
						() => {
							if (signal.aborted) {
								return;
							}

							setPending(false);
						},
						(err) => {
							if (signal.aborted) {
								return;
							}

							setPending(false);
							logger.error(`Critical error: ${err}`);
						},
					);
				}}
				class="m-4 flex flex-col gap-4"
			>
				<fieldset disabled={pending()} class="contents">
					<label class="flex flex-col gap-2">
						<span class="font-semibold text-gray-600">Handle or DID identifier*</span>
						<input
							type="text"
							name="ident"
							required
							pattern={DID_OR_HANDLE_RE.source}
							placeholder="paul.bsky.social"
							class="rounded border border-gray-300 px-3 py-2 text-sm outline-2 -outline-offset-1 outline-purple-600 placeholder:text-gray-400 focus:outline"
						/>
					</label>

					<label class="flex flex-col gap-2">
						<span class="font-semibold text-gray-600">PDS service</span>
						<input
							type="url"
							name="service"
							placeholder="https://bsky.social"
							onInput={(ev) => {
								const input = ev.currentTarget;
								const value = input.value;

								if (value !== '' && !v.is(serviceUrlString, value)) {
									input.setCustomValidity('Must be a valid service URL');
								} else {
									input.setCustomValidity('');
								}
							}}
							class="rounded border border-gray-300 px-3 py-2 text-sm outline-2 -outline-offset-1 outline-purple-600 placeholder:text-gray-400 focus:outline"
						/>
					</label>

					<div>
						<button
							type="submit"
							class="flex h-9 select-none items-center rounded bg-purple-800 px-4 text-sm font-semibold text-white hover:bg-purple-700 active:bg-purple-700 disabled:pointer-events-none disabled:opacity-50"
						>
							Export!
						</button>
					</div>
				</fieldset>
			</form>
			<hr class="mx-4 border-gray-200" />

			<Logger logger={logger} />
		</>
	);
};

export default RepoExportPage;

export async function* iterateStream<T>(stream: ReadableStream<T>) {
	// Get a lock on the stream
	const reader = stream.getReader();

	try {
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				return;
			}

			yield value;
		}
	} finally {
		reader.releaseLock();
	}
}
