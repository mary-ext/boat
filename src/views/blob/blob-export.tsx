import { FileSystemWritableFileStream, showSaveFilePicker } from 'native-file-system-adapter';
import { createSignal } from 'solid-js';

import { simpleFetchHandler, XRPC, XRPCError } from '@atcute/client';
import { At } from '@atcute/client/lexicons';
import { writeTarEntry } from '@mary/tar';

import { getDidDocument } from '~/api/queries/did-doc';
import { resolveHandleViaAppView, resolveHandleViaPds } from '~/api/queries/handle';
import { getPdsEndpoint } from '~/api/types/did-doc';
import { isServiceUrlString } from '~/api/types/strings';
import { DID_OR_HANDLE_RE, isDid } from '~/api/utils/strings';

import { makeAbortable } from '~/lib/utils/abortable';
import { PromiseQueue } from '~/lib/utils/promise-queue';

import Logger, { createLogger } from '~/components/logger';

const BlobExportPage = () => {
	const logger = createLogger();

	const [getSignal, cleanup] = makeAbortable();
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

		const rpc = new XRPC({ handler: simpleFetchHandler({ service }) });

		// Grab a list of blobs
		let blobs: string[] = [];
		{
			using progress = logger.progress(`Retrieving list of blobs`);

			let cursor: string | undefined;
			do {
				const { data } = await rpc.get('com.atproto.sync.listBlobs', {
					signal,
					params: { did, cursor, limit: 1_000 },
				});

				cursor = data.cursor;
				blobs = blobs.concat(data.cids);

				progress.update(`Retrieving list of blobs (found ${blobs.length})`);
			} while (cursor !== undefined);

			logger.log(`Found ${blobs.length} blobs to download`);
			if (blobs.length === 0) {
				logger.warn(`Nothing to do`);
				return;
			}
		}

		// Now ask the user to save
		let writable: FileSystemWritableFileStream | undefined;
		{
			using _progress = logger.progress(`Waiting for the user`);

			const fd = await showSaveFilePicker({
				suggestedName: `blobs-${identifier}-${new Date().toISOString()}.tar`,

				// @ts-expect-error: ponyfill doesn't have the full typings
				id: 'blob-export',
				startIn: 'downloads',
				types: [
					{
						description: 'Tarball archive',
						accept: { 'application/tar': ['.tar'] },
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

			writable = await fd?.createWritable();

			if (writable === undefined) {
				// We already handled the errors above
				return;
			}

			signal?.throwIfAborted();
		}

		// Let's download!
		{
			let downloadedCount = 0;

			using progress = logger.progress(`Downloading blobs (${downloadedCount} of ${blobs.length})`);

			const queue = new PromiseQueue();
			for (const cid of blobs) {
				queue.add(async () => {
					const download = async () => {
						let attempts = 0;

						while (true) {
							if (attempts > 0) {
								await sleep(2_000);
							}

							attempts++;

							try {
								const { data } = await rpc.get('com.atproto.sync.getBlob', {
									signal,
									params: { did, cid },
								});

								return data;
							} catch (err) {
								if (attempts > 3) {
									throw err;
								}

								if (err instanceof XRPCError) {
									if (err.status === 400) {
										if (err.message === 'Blob not found') {
											console.warn(`Blob ${cid} not found`);
											return;
										}
									} else if (err.status === 429) {
										const reset = err.headers?.['ratelimit-reset'];

										if (reset !== undefined) {
											logger.warn(`Ratelimit exceeded when downloading ${cid}, waiting`);

											const refreshAt = +reset * 1_000;
											const delta = refreshAt - Date.now();

											await sleep(delta);
										}
									}
								}
							}
						}
					};

					const data = await download();
					if (data !== undefined) {
						const entry = writeTarEntry({ filename: `blobs/${cid}`, data });
						writable.write(entry);
					}

					progress.update(`Downloading blobs (${++downloadedCount} of ${blobs.length})`);
				});
			}

			// Await for everything here.
			await queue.flush();
		}

		// We're done here.
		{
			using _progress = logger.progress(`Flushing writes`);
			await writable.close();
		}

		logger.log(`Finished!`);
	};

	return (
		<>
			<div class="p-4">
				<h1 class="text-lg font-bold text-purple-800">Export blobs</h1>
				<p class="text-gray-600">Download all blobs from an account into a tarball</p>
			</div>
			<hr class="mx-4 border-gray-300" />

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

							cleanup();
							setPending(false);
						},
						(err) => {
							if (signal.aborted) {
								return;
							}

							cleanup();
							setPending(false);

							console.error(err);
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
							class="rounded border border-gray-400 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-purple-800 focus:ring-1 focus:ring-purple-800 focus:ring-offset-0"
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

								if (value !== '' && !isServiceUrlString(value)) {
									input.setCustomValidity('Must be a valid service URL');
								} else {
									input.setCustomValidity('');
								}
							}}
							class="rounded border border-gray-400 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-purple-800 focus:ring-1 focus:ring-purple-800 focus:ring-offset-0"
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
			<hr class="mx-4 border-gray-300" />

			<Logger logger={logger} />
		</>
	);
};

export default BlobExportPage;

const sleep = (ms: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};
