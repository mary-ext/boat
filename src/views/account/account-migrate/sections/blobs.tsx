import { showOpenFilePicker, showSaveFilePicker } from 'native-file-system-adapter';
import { createSignal, For, Show } from 'solid-js';

import { Client, ClientResponseError, type CredentialManager, ok, simpleFetchHandler } from '@atcute/client';
import { untar, writeTarEntry } from '@mary/tar';

import { createMutation } from '~/lib/utils/mutation';

import { Accordion, StatusBadge, Subsection } from '~/components/accordion';
import Button from '~/components/inputs/button';

import { useMigration, type SourceAccount } from '../context';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const BlobsSection = () => {
	const { source, destination } = useMigration();

	// Progress state (kept separate since mutations don't handle incremental updates)
	const [exportProgress, setExportProgress] = createSignal<string>();
	const [importProgress, setImportProgress] = createSignal<string>();

	const exportMutation = createMutation({
		async mutationFn({ source }: { source: SourceAccount }) {
			const sourceClient = new Client({ handler: simpleFetchHandler({ service: source.pdsUrl }) });

			setExportProgress('Retrieving list of blobs...');

			// Get list of all blobs
			let blobs: string[] = [];
			let cursor: string | undefined;
			do {
				const data = await ok(
					sourceClient.get('com.atproto.sync.listBlobs', {
						params: { did: source.did, cursor, limit: 1_000 },
					}),
				);
				cursor = data.cursor;
				blobs = blobs.concat(data.cids);
				setExportProgress(`Retrieving list of blobs (found ${blobs.length})`);
			} while (cursor !== undefined);

			if (blobs.length === 0) {
				return { count: 0, cancelled: false };
			}

			setExportProgress('Waiting for file picker...');

			const fd = await showSaveFilePicker({
				suggestedName: `blobs-${source.did}-${new Date().toISOString()}.tar`,
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
				if (err instanceof DOMException && err.name === 'AbortError') {
					return undefined;
				}
				throw err;
			});

			if (!fd) {
				return { count: 0, cancelled: true };
			}

			const writable = await fd.createWritable();

			let downloaded = 0;
			for (const cid of blobs) {
				setExportProgress(`Downloading blobs (${downloaded}/${blobs.length})`);

				const downloadBlob = async (): Promise<Uint8Array | undefined> => {
					let attempts = 0;
					while (true) {
						if (attempts > 0) await sleep(2_000);
						attempts++;

						try {
							const response = await sourceClient.get('com.atproto.sync.getBlob', {
								as: 'bytes',
								params: { did: source.did, cid },
							});

							if (response.ok) {
								return response.data;
							}

							if (response.status === 400 && response.data.message === 'Blob not found') {
								return undefined;
							}

							if (response.status === 429) {
								await sleep(10_000);
							}

							if (attempts < 3) continue;
							throw new ClientResponseError(response);
						} catch (err) {
							if (attempts < 3) continue;
							throw err;
						}
					}
				};

				const data = await downloadBlob();
				if (data !== undefined) {
					const entry = writeTarEntry({ filename: `blobs/${cid}`, data });
					await writable.write(entry);
				}

				downloaded++;
			}

			await writable.close();
			return { count: blobs.length, cancelled: false };
		},
		onError(err) {
			console.error(err);
		},
		onSettled() {
			setExportProgress();
		},
	});

	const importFromFileMutation = createMutation({
		async mutationFn({ destManager }: { destManager: CredentialManager }) {
			setImportProgress('Waiting for file picker...');

			const [fd] = await showOpenFilePicker({
				// @ts-expect-error: ponyfill doesn't have the full typings
				id: 'blob-import',
				types: [
					{
						description: 'Tarball archive',
						accept: { 'application/tar': ['.tar'] },
					},
				],
			}).catch((err) => {
				if (err instanceof DOMException && err.name === 'AbortError') {
					return [undefined];
				}
				throw err;
			});

			if (!fd) {
				return { uploaded: 0, failed: 0, cancelled: true };
			}

			setImportProgress('Reading archive...');
			const file = await fd.getFile();

			const destClient = new Client({ handler: destManager });

			let uploaded = 0;
			let failed = 0;

			for await (const entry of untar(file.stream())) {
				if (entry.type !== 'file') continue;

				const filename = entry.name;
				// Extract CID from path like "blobs/bafk..."
				const cid = filename.split('/').pop();
				if (!cid) continue;

				setImportProgress(`Uploading blobs (${uploaded} uploaded, ${failed} failed)`);

				try {
					const data = await entry.bytes();
					await destClient.post('com.atproto.repo.uploadBlob', {
						input: data,
						headers: {
							'content-type': 'application/octet-stream',
						},
					});
					uploaded++;
				} catch (err) {
					console.error(`Failed to upload blob ${cid}:`, err);
					failed++;
				}
			}

			return { uploaded, failed, cancelled: false };
		},
		onError(err) {
			console.error(err);
		},
		onSettled() {
			setImportProgress();
		},
	});

	const importFromSourceMutation = createMutation({
		async mutationFn({ source, destManager }: { source: SourceAccount; destManager: CredentialManager }) {
			setImportProgress('Checking for missing blobs...');

			const sourceClient = new Client({ handler: simpleFetchHandler({ service: source.pdsUrl }) });
			const destClient = new Client({ handler: destManager });

			let uploaded = 0;
			let failed = 0;
			let cursor: string | undefined;

			do {
				const data = await ok(
					destClient.get('com.atproto.repo.listMissingBlobs', {
						params: { cursor, limit: 100 },
					}),
				);
				cursor = data.cursor;

				for (const blob of data.blobs) {
					setImportProgress(`Uploading missing blobs (${uploaded} uploaded, ${failed} failed)`);

					try {
						const response = await sourceClient.get('com.atproto.sync.getBlob', {
							as: 'stream',
							params: { did: source.did, cid: blob.cid },
						});

						if (!response.ok) {
							failed++;
							continue;
						}

						const contentType = response.headers.get('content-type') || 'application/octet-stream';

						await destClient.post('com.atproto.repo.uploadBlob', {
							input: response.data,
							headers: {
								'content-type': contentType,
							},
						});

						uploaded++;
					} catch (err) {
						console.error(`Failed to transfer blob ${blob.cid}:`, err);
						failed++;
					}
				}
			} while (cursor !== undefined);

			return { uploaded, failed };
		},
		onError(err) {
			console.error(err);
		},
		onSettled() {
			setImportProgress();
		},
	});

	const checkStatusMutation = createMutation({
		async mutationFn({ destManager }: { destManager: CredentialManager }) {
			const destClient = new Client({ handler: destManager });
			const status = await ok(destClient.get('com.atproto.server.checkAccountStatus'));

			let missingBlobs: string[] = [];

			// Get list of missing blobs if any
			if (status.expectedBlobs > status.importedBlobs) {
				let cursor: string | undefined;
				do {
					const data = await ok(
						destClient.get('com.atproto.repo.listMissingBlobs', {
							params: { cursor, limit: 100 },
						}),
					);
					cursor = data.cursor;
					missingBlobs.push(...data.blobs.map((b) => b.cid));
				} while (cursor !== undefined);
			}

			return {
				expected: status.expectedBlobs,
				imported: status.importedBlobs,
				missingBlobs,
			};
		},
		onError(err) {
			console.error(err);
		},
	});

	const isImporting = () => importFromFileMutation.isPending || importFromSourceMutation.isPending;

	const getExportStatusText = () => {
		const data = exportMutation.data;
		if (data?.cancelled) return undefined;
		if (data?.count === 0) return 'No blobs to export';
		if (data) return `Exported ${data.count} blobs`;
		return exportProgress();
	};

	const getImportStatusText = () => {
		const fileData = importFromFileMutation.data;
		const sourceData = importFromSourceMutation.data;

		if (fileData && !fileData.cancelled) {
			return (
				`Uploaded ${fileData.uploaded} blobs` + (fileData.failed > 0 ? ` (${fileData.failed} failed)` : '')
			);
		}
		if (sourceData) {
			if (sourceData.uploaded === 0 && sourceData.failed === 0) return 'No missing blobs';
			return (
				`Uploaded ${sourceData.uploaded} blobs` +
				(sourceData.failed > 0 ? ` (${sourceData.failed} failed)` : '')
			);
		}
		return importProgress();
	};

	const getImportError = () => importFromFileMutation.error || importFromSourceMutation.error;

	return (
		<Accordion title="Blobs">
			<Subsection title="Export from source">
				<p class="text-sm text-gray-600">Download all blobs as a tarball for backup or manual import.</p>

				<Show when={source()} fallback={<p class="text-sm text-gray-500">Resolve source account first.</p>}>
					{(src) => (
						<>
							<div class="flex items-center gap-3">
								<Button
									onClick={() => exportMutation.mutate({ source: src() })}
									disabled={exportMutation.isPending}
								>
									{exportMutation.isPending ? 'Exporting...' : 'Export to file'}
								</Button>
								<Show when={getExportStatusText()}>
									{(text) => <span class="text-sm text-gray-600">{text()}</span>}
								</Show>
							</div>

							<Show when={exportMutation.error}>
								{(err) => <p class="text-sm text-red-600">{`${err()}`}</p>}
							</Show>
						</>
					)}
				</Show>
			</Subsection>

			<Subsection title="Import to destination">
				<p class="text-sm text-gray-600">Upload blobs from a tarball or transfer directly from source.</p>

				<Show
					when={destination()?.manager}
					fallback={<p class="text-sm text-gray-500">Sign in to destination account first.</p>}
				>
					{(destManager) => (
						<>
							<div class="flex flex-wrap items-center gap-3">
								<Button
									onClick={() => importFromFileMutation.mutate({ destManager: destManager() })}
									disabled={isImporting()}
								>
									{isImporting() ? 'Importing...' : 'Import from file'}
								</Button>

								<Show when={source()}>
									{(src) => (
										<Button
											variant="secondary"
											onClick={() =>
												importFromSourceMutation.mutate({ source: src(), destManager: destManager() })
											}
											disabled={isImporting()}
										>
											Transfer from source
										</Button>
									)}
								</Show>
							</div>

							<Show when={getImportStatusText()}>
								{(text) => <span class="text-sm text-gray-600">{text()}</span>}
							</Show>

							<Show when={getImportError()}>{(err) => <p class="text-sm text-red-600">{`${err()}`}</p>}</Show>
						</>
					)}
				</Show>
			</Subsection>

			<Subsection title="Status">
				<Show
					when={destination()?.manager}
					fallback={<p class="text-sm text-gray-500">Sign in to destination account first.</p>}
				>
					{(destManager) => (
						<>
							<div class="flex items-center gap-3">
								<Button
									variant="outline"
									onClick={() => checkStatusMutation.mutate({ destManager: destManager() })}
									disabled={checkStatusMutation.isPending}
								>
									{checkStatusMutation.isPending ? 'Checking...' : 'Check status'}
								</Button>

								<Show when={checkStatusMutation.data}>
									{(status) => (
										<span class="text-sm">
											<StatusBadge variant={status().imported === status().expected ? 'success' : 'pending'}>
												{status().imported}/{status().expected} blobs
											</StatusBadge>
										</span>
									)}
								</Show>
							</div>

							<Show when={checkStatusMutation.data?.missingBlobs.length}>
								{(count) => (
									<div class="mt-2 rounded border border-yellow-300 bg-yellow-50 p-3">
										<p class="mb-2 text-sm font-medium text-yellow-800">{count()} missing blobs</p>

										<Show when={source()}>
											{(src) => (
												<Button
													variant="secondary"
													onClick={() =>
														importFromSourceMutation.mutate({ source: src(), destManager: destManager() })
													}
													disabled={isImporting()}
												>
													Transfer missing from source
												</Button>
											)}
										</Show>

										<details class="mt-2">
											<summary class="cursor-pointer text-sm text-yellow-700">Show CIDs</summary>
											<div class="mt-1 max-h-32 overflow-auto font-mono text-xs">
												<For each={checkStatusMutation.data?.missingBlobs}>
													{(cid) => <div class="truncate">{cid}</div>}
												</For>
											</div>
										</details>
									</div>
								)}
							</Show>
						</>
					)}
				</Show>
			</Subsection>
		</Accordion>
	);
};

export default BlobsSection;
