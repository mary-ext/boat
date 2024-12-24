import { type FileSystemFileHandle, showSaveFilePicker } from 'native-file-system-adapter';
import { createSignal } from 'solid-js';

import { At } from '@atcute/client/lexicons';

import { getDidDocument } from '~/api/queries/did-doc';
import { resolveHandleViaAppView, resolveHandleViaPds } from '~/api/queries/handle';
import { getPdsEndpoint } from '~/api/types/did-doc';
import { isServiceUrlString } from '~/api/types/strings';
import { DID_OR_HANDLE_RE, isDid } from '~/api/utils/strings';

import { useTitle } from '~/lib/navigation/router';
import { makeAbortable } from '~/lib/utils/abortable';
import { formatBytes } from '~/lib/utils/intl/bytes';

import Button from '~/components/inputs/button';
import TextInput from '~/components/inputs/text-input';
import Logger, { createLogger } from '~/components/logger';

const RepoExportPage = () => {
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

		let fd: FileSystemFileHandle | undefined;

		{
			using _progress = logger.progress(`Waiting for the user`);

			fd = await showSaveFilePicker({
				suggestedName: `repo-${identifier}-${new Date().toISOString()}.car`,

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

			if (fd === undefined) {
				// We already handled the errors above
				return;
			}
		}

		const writable = await fd.createWritable();

		{
			using progress = logger.progress(`Downloading CAR file`);

			const repoUrl = new URL(`/xrpc/com.atproto.sync.getRepo?did=${did}`, service);
			const response = await fetch(repoUrl, { signal: signal });

			if (!response.ok || !response.body) {
				logger.error(`Failed to retrieve CAR file`);
				return;
			}

			let size = 0;

			for await (const chunk of iterateStream(response.body)) {
				size += chunk.length;
				writable.write(chunk);

				progress.update(`Downloading CAR file (${formatBytes(size)})`);
			}

			logger.log(`CAR file downloaded (${formatBytes(size)})`);
		}

		{
			using _progress = logger.progress(`Flushing writes`);
			await writable.close();
		}

		logger.log(`Finished`);
	};

	useTitle(() => `Export repository — boat`);

	return (
		<>
			<div class="p-4">
				<h1 class="text-lg font-bold text-purple-800">Export repository</h1>
				<p class="text-gray-600">Download an archive of an account's repository</p>
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
					<TextInput
						label="Handle or DID identifier*"
						type="text"
						name="ident"
						autocomplete="username"
						pattern={/* @once */ DID_OR_HANDLE_RE.source}
						placeholder="paul.bsky.social"
						autofocus
					/>

					<TextInput
						label="PDS service"
						type="url"
						placeholder="https://bsky.social"
						onChange={(text, event) => {
							const input = event.currentTarget;

							if (text !== '' && !isServiceUrlString(text)) {
								input.setCustomValidity('Must be a valid service URL');
							} else {
								input.setCustomValidity('');
							}
						}}
					/>

					<div>
						<Button type="submit">Export!</Button>
					</div>
				</fieldset>
			</form>
			<hr class="mx-4 border-gray-300" />

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
