import { showSaveFilePicker } from 'native-file-system-adapter';
import { createSignal, Show } from 'solid-js';

import { Client, type CredentialManager, ok } from '@atcute/client';

import { createMutation } from '~/lib/utils/mutation';

import { Accordion, StatusBadge, Subsection } from '~/components/accordion';
import Button from '~/components/inputs/button';
import MultilineInput from '~/components/inputs/multiline-input';

import { useMigration } from '../context';

const PreferencesSection = () => {
	const { source, destination } = useMigration();

	const [prefsInput, setPrefsInput] = createSignal('');

	const exportMutation = createMutation({
		async mutationFn({ sourceManager }: { sourceManager: CredentialManager }) {
			const sourceClient = new Client({ handler: sourceManager });
			const prefs = await ok(sourceClient.get('app.bsky.actor.getPreferences', { params: {} }));
			return JSON.stringify(prefs, null, 2);
		},
		onSuccess(json) {
			setPrefsInput(json);
		},
		onError(err) {
			console.error(err);
		},
	});

	const downloadPrefs = async () => {
		const prefs = exportMutation.data;
		if (!prefs) return;

		try {
			const fd = await showSaveFilePicker({
				suggestedName: `preferences-${source()?.did}-${new Date().toISOString()}.json`,
				// @ts-expect-error: ponyfill doesn't have the full typings
				id: 'prefs-export',
				startIn: 'downloads',
				types: [
					{
						description: 'JSON file',
						accept: { 'application/json': ['.json'] },
					},
				],
			}).catch((err) => {
				if (err instanceof DOMException && err.name === 'AbortError') {
					return undefined;
				}
				throw err;
			});

			if (!fd) return;

			const writable = await fd.createWritable();
			await writable.write(prefs);
			await writable.close();
		} catch (err) {
			console.error(err);
		}
	};

	const importMutation = createMutation({
		async mutationFn({ destManager, input }: { destManager: CredentialManager; input: string }) {
			const prefs = JSON.parse(input);

			// Validate that it has a preferences array
			if (!prefs.preferences || !Array.isArray(prefs.preferences)) {
				throw new Error('Invalid preferences format: missing preferences array');
			}

			const destClient = new Client({ handler: destManager });
			await destClient.post('app.bsky.actor.putPreferences', {
				as: null,
				input: prefs,
			});
		},
		onError(err) {
			console.error(err);
		},
	});

	const getImportErrorMessage = () => {
		const err = importMutation.error;
		if (err instanceof SyntaxError) {
			return 'Invalid JSON format';
		}
		return `${err}`;
	};

	return (
		<Accordion title="Preferences">
			<Subsection title="Export from source">
				<p class="text-sm text-gray-600">
					Export your Bluesky preferences (muted words, content filters, saved feeds, etc).
				</p>

				<Show
					when={source()?.manager}
					fallback={<p class="text-sm text-gray-500">Sign in to source account first.</p>}
				>
					{(sourceManager) => (
						<>
							<div class="flex items-center gap-3">
								<Button
									onClick={() => exportMutation.mutate({ sourceManager: sourceManager() })}
									disabled={exportMutation.isPending}
								>
									{exportMutation.isPending ? 'Exporting...' : 'Export preferences'}
								</Button>

								<Show when={exportMutation.data}>
									<Button variant="secondary" onClick={downloadPrefs}>
										Download as file
									</Button>
								</Show>
							</div>

							<Show when={exportMutation.error}>
								{(err) => <p class="text-sm text-red-600">{`${err()}`}</p>}
							</Show>

							<Show when={exportMutation.data}>
								{(prefs) => (
									<details class="mt-2">
										<summary class="cursor-pointer text-sm text-gray-600">
											View exported preferences
										</summary>
										<pre class="mt-2 max-h-48 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 font-mono text-xs">
											{prefs()}
										</pre>
									</details>
								)}
							</Show>
						</>
					)}
				</Show>
			</Subsection>

			<Subsection title="Import to destination">
				<p class="text-sm text-gray-600">Paste preferences JSON or use the exported data above.</p>

				<Show
					when={destination()?.manager}
					fallback={<p class="text-sm text-gray-500">Sign in to destination account first.</p>}
				>
					{(destManager) => (
						<>
							<MultilineInput label="Preferences JSON" value={prefsInput()} onChange={setPrefsInput} />

							<div class="flex items-center gap-3">
								<Button
									onClick={() =>
										importMutation.mutate({ destManager: destManager(), input: prefsInput().trim() })
									}
									disabled={importMutation.isPending || !prefsInput().trim()}
								>
									{importMutation.isPending ? 'Importing...' : 'Import preferences'}
								</Button>

								<Show when={importMutation.isSuccess}>
									<StatusBadge variant="success">Preferences imported successfully</StatusBadge>
								</Show>
							</div>

							<Show when={importMutation.error}>
								<p class="text-sm text-red-600">{getImportErrorMessage()}</p>
							</Show>
						</>
					)}
				</Show>
			</Subsection>
		</Accordion>
	);
};

export default PreferencesSection;
