import { showOpenFilePicker, showSaveFilePicker } from 'native-file-system-adapter';
import { createSignal, Show } from 'solid-js';

import { Client, type CredentialManager, ok, simpleFetchHandler } from '@atcute/client';
import type { Did } from '@atcute/lexicons/syntax';

import { formatBytes } from '~/lib/utils/intl/bytes';
import { createMutation } from '~/lib/utils/mutation';
import { iterateStream } from '~/lib/utils/stream';

import { Accordion, StatusBadge, Subsection } from '~/components/accordion';
import Button from '~/components/inputs/button';

import { useMigration } from '../context';

const RepositorySection = () => {
	const { source, destination } = useMigration();

	// Export state
	const [exportStatus, setExportStatus] = createSignal<string>();

	// Import state
	const [importStatus, setImportStatus] = createSignal<string>();
	const [importedRecords, setImportedRecords] = createSignal<number>();

	const exportMutation = createMutation({
		async mutationFn({ pdsUrl, did }: { pdsUrl: string; did: Did }) {
			setExportStatus('Waiting for file picker...');

			const fd = await showSaveFilePicker({
				suggestedName: `repo-${did}-${new Date().toISOString()}.car`,
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
				if (err instanceof DOMException && err.name === 'AbortError') {
					return undefined;
				}
				throw err;
			});

			if (!fd) {
				setExportStatus();
				return null;
			}

			const writable = await fd.createWritable();

			setExportStatus('Downloading repository...');

			const sourceClient = new Client({ handler: simpleFetchHandler({ service: pdsUrl }) });
			const response = await sourceClient.get('com.atproto.sync.getRepo', {
				as: 'stream',
				params: { did },
			});

			if (!response.ok) {
				throw new Error(`Failed to download repository: ${response.status}`);
			}

			let size = 0;
			for await (const chunk of iterateStream(response.data)) {
				size += chunk.length;
				await writable.write(chunk);
				setExportStatus(`Downloading repository... (${formatBytes(size)})`);
			}

			await writable.close();
			setExportStatus(`Exported ${formatBytes(size)}`);
			return size;
		},
		onMutate() {
			setExportStatus();
		},
		onError(err) {
			console.error(err);
			setExportStatus();
		},
	});

	const importFromFileMutation = createMutation({
		async mutationFn({ manager }: { manager: CredentialManager }) {
			setImportStatus('Waiting for file picker...');

			const [fd] = await showOpenFilePicker({
				// @ts-expect-error: ponyfill doesn't have the full typings
				id: 'repo-import',
				types: [
					{
						description: 'CAR archive file',
						accept: { 'application/vnd.ipld.car': ['.car'] },
					},
				],
			}).catch((err) => {
				if (err instanceof DOMException && err.name === 'AbortError') {
					return [undefined];
				}
				throw err;
			});

			if (!fd) {
				setImportStatus();
				return null;
			}

			const file = await fd.getFile();

			setImportStatus(`Uploading repository (${formatBytes(file.size)})...`);

			const destClient = new Client({ handler: manager });
			const importResp = await destClient.post('com.atproto.repo.importRepo', {
				as: null,
				input: file,
				headers: {
					'content-type': 'application/vnd.ipld.car',
				},
			});

			if (!importResp.ok) {
				throw new Error(`Failed to import repository: ${importResp.status}`);
			}

			// Check account status to get record count
			const status = await ok(destClient.get('com.atproto.server.checkAccountStatus', {}));
			setImportedRecords(status.indexedRecords);

			setImportStatus(`Imported successfully`);
			return status.indexedRecords;
		},
		onMutate() {
			setImportStatus();
			setImportedRecords();
		},
		onError(err) {
			console.error(err);
			setImportStatus();
		},
	});

	const importFromSourceMutation = createMutation({
		async mutationFn({
			sourcePdsUrl,
			sourceDid,
			destManager,
		}: {
			sourcePdsUrl: string;
			sourceDid: Did;
			destManager: CredentialManager;
		}) {
			setImportStatus('Downloading from source PDS...');

			const sourceClient = new Client({ handler: simpleFetchHandler({ service: sourcePdsUrl }) });
			const response = await sourceClient.get('com.atproto.sync.getRepo', {
				as: 'bytes',
				params: { did: sourceDid },
			});

			if (!response.ok) {
				throw new Error(`Failed to download repository: ${response.status}`);
			}

			setImportStatus(`Uploading to destination (${formatBytes(response.data.length)})...`);

			const destClient = new Client({ handler: destManager });
			const importResp = await destClient.post('com.atproto.repo.importRepo', {
				as: null,
				input: response.data,
				headers: {
					'content-type': 'application/vnd.ipld.car',
				},
			});

			if (!importResp.ok) {
				throw new Error(`Failed to import repository: ${importResp.status}`);
			}

			// Check account status to get record count
			const status = await ok(destClient.get('com.atproto.server.checkAccountStatus', {}));
			setImportedRecords(status.indexedRecords);

			setImportStatus(`Imported successfully`);
			return status.indexedRecords;
		},
		onMutate() {
			setImportStatus();
			setImportedRecords();
		},
		onError(err) {
			console.error(err);
			setImportStatus();
		},
	});

	const isExporting = () => exportMutation.isPending;
	const isImporting = () => importFromFileMutation.isPending || importFromSourceMutation.isPending;

	return (
		<Accordion title="Repository">
			<Subsection title="Export from source">
				<p class="text-sm text-gray-600">
					Download the repository as a CAR file for backup or manual import.
				</p>

				<Show when={source()} fallback={<p class="text-sm text-gray-500">Resolve source account first.</p>}>
					{(src) => (
						<>
							<div class="flex items-center gap-3">
								<Button
									onClick={() => exportMutation.mutate({ pdsUrl: src().pdsUrl, did: src().did })}
									disabled={isExporting()}
								>
									{isExporting() ? 'Exporting...' : 'Export to file'}
								</Button>
								<Show when={exportStatus()}>
									<span class="text-sm text-gray-600">{exportStatus()}</span>
								</Show>
							</div>

							<Show when={exportMutation.isError}>
								<p class="text-sm text-red-600">{`${exportMutation.error}`}</p>
							</Show>
						</>
					)}
				</Show>
			</Subsection>

			<Subsection title="Import to destination">
				<p class="text-sm text-gray-600">Upload a repository CAR file or transfer directly from source.</p>

				<Show
					when={destination()?.manager}
					fallback={<p class="text-sm text-gray-500">Sign in to destination account first.</p>}
				>
					{(manager) => (
						<>
							<div class="flex flex-wrap items-center gap-3">
								<Button
									onClick={() => importFromFileMutation.mutate({ manager: manager() })}
									disabled={isImporting()}
								>
									{isImporting() ? 'Importing...' : 'Import from file'}
								</Button>

								<Show when={source()}>
									{(src) => (
										<Button
											variant="secondary"
											onClick={() =>
												importFromSourceMutation.mutate({
													sourcePdsUrl: src().pdsUrl,
													sourceDid: src().did,
													destManager: manager(),
												})
											}
											disabled={isImporting()}
										>
											Transfer from source
										</Button>
									)}
								</Show>
							</div>

							<Show when={importStatus()}>
								<div class="flex items-center gap-2">
									<span class="text-sm text-gray-600">{importStatus()}</span>
									<Show when={importedRecords() !== undefined}>
										<StatusBadge variant="success">{importedRecords()} records</StatusBadge>
									</Show>
								</div>
							</Show>

							<Show when={importFromFileMutation.isError || importFromSourceMutation.isError}>
								<p class="text-sm text-red-600">
									{`${importFromFileMutation.error || importFromSourceMutation.error}`}
								</p>
							</Show>
						</>
					)}
				</Show>
			</Subsection>
		</Accordion>
	);
};

export default RepositorySection;
