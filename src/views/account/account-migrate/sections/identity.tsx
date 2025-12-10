import { createSignal, For, Index, Show } from 'solid-js';

import { Client, ClientResponseError, type CredentialManager, ok } from '@atcute/client';
import { type DidKeyString, Secp256k1PrivateKeyExportable } from '@atcute/crypto';
import type { Did } from '@atcute/lexicons/syntax';

import { getPlcAuditLogs } from '~/api/queries/plc';
import { formatTotpCode, TOTP_RE } from '~/api/utils/auth';

import { createMutation } from '~/lib/utils/mutation';

import { Accordion, StatusBadge, Subsection } from '~/components/accordion';
import Button from '~/components/inputs/button';
import TextInput from '~/components/inputs/text-input';
import ToggleInput from '~/components/inputs/toggle-input';

import { getPlcPayload } from '~/views/identity/plc-applicator/plc-utils';

import { useMigration } from '../context';

interface RecommendedCredentials {
	alsoKnownAs?: string[];
	rotationKeys?: string[];
	verificationMethods?: Record<string, unknown>;
	services?: Record<string, unknown>;
}

interface GeneratedKeypair {
	publicDidKey: DidKeyString;
	privateHex: string;
	privateMultikey: string;
}

const IdentitySection = () => {
	const { source, destination } = useMigration();

	// Rotation key state
	const [useGeneratedKey, setUseGeneratedKey] = createSignal(false);
	const [customKeys, setCustomKeys] = createSignal<string[]>([]);
	const [plcToken, setPlcToken] = createSignal('');

	const requestTokenMutation = createMutation({
		async mutationFn({ manager }: { manager: CredentialManager }) {
			const client = new Client({ handler: manager });
			await ok(client.post('com.atproto.identity.requestPlcOperationSignature', { as: null }));
		},
		onError(err) {
			console.error(err);
		},
	});

	const loadCredentialsMutation = createMutation({
		async mutationFn({ manager }: { manager: CredentialManager }) {
			const client = new Client({ handler: manager });
			return (await ok(
				client.get('com.atproto.identity.getRecommendedDidCredentials', {}),
			)) as RecommendedCredentials;
		},
		onError(err) {
			console.error(err);
		},
	});

	// Analyze current rotation keys to find user-controlled keys that should be preserved
	const analyzeRotationKeysMutation = createMutation({
		async mutationFn({ did, sourceManager }: { did: Did<'plc'>; sourceManager: CredentialManager }, signal) {
			// Get current rotation keys from PLC audit log
			const auditLogs = await getPlcAuditLogs({ did, signal });
			const latestEntry = auditLogs[auditLogs.length - 1];
			const currentPayload = getPlcPayload(latestEntry);
			const currentRotationKeys = currentPayload.rotationKeys ?? [];

			// Get source PDS's recommended credentials to identify PDS-controlled keys
			const sourceClient = new Client({ handler: sourceManager });
			const sourcePdsCredentials = (await ok(
				sourceClient.get('com.atproto.identity.getRecommendedDidCredentials', {}),
			)) as RecommendedCredentials;
			const sourcePdsKeys = new Set(sourcePdsCredentials.rotationKeys ?? []);

			// Keys in current doc that aren't from source PDS are user-controlled
			const userControlledKeys = currentRotationKeys.filter((key) => !sourcePdsKeys.has(key));

			return {
				currentRotationKeys,
				sourcePdsKeys: sourcePdsCredentials.rotationKeys ?? [],
				userControlledKeys,
			};
		},
		onSuccess(data) {
			// Pre-populate custom keys with user-controlled keys
			if (data.userControlledKeys.length > 0) {
				setCustomKeys(data.userControlledKeys);
			}
		},
		onError(err) {
			console.error(err);
		},
	});

	const generateKeyMutation = createMutation({
		async mutationFn() {
			const keypair = await Secp256k1PrivateKeyExportable.createKeypair();
			const [publicDidKey, privateHex, privateMultikey] = await Promise.all([
				keypair.exportPublicKey('did'),
				keypair.exportPrivateKey('rawHex'),
				keypair.exportPrivateKey('multikey'),
			]);
			return { publicDidKey, privateHex, privateMultikey } as GeneratedKeypair;
		},
		onError(err) {
			console.error(err);
		},
	});

	const signAndSubmitMutation = createMutation({
		async mutationFn({
			sourceManager,
			destManager,
			token,
			credentials,
			generatedKey,
			customKeys,
		}: {
			sourceManager: CredentialManager;
			destManager: CredentialManager;
			token: string;
			credentials: RecommendedCredentials;
			generatedKey?: GeneratedKeypair;
			customKeys: string[];
		}) {
			const sourceClient = new Client({ handler: sourceManager });
			const destClient = new Client({ handler: destManager });

			// Prepend user keys to PDS-provided keys (so user keys appear first for recovery)
			const pdsRotationKeys = credentials.rotationKeys ?? [];
			const userKeys: string[] = [];
			if (generatedKey) {
				userKeys.push(generatedKey.publicDidKey);
			}
			userKeys.push(...customKeys.filter((k) => k.trim()));
			const rotationKeys = [...userKeys, ...pdsRotationKeys];

			// Sign the PLC operation on the source PDS
			const signage = await ok(
				sourceClient.post('com.atproto.identity.signPlcOperation', {
					input: {
						token: formatTotpCode(token),
						alsoKnownAs: credentials.alsoKnownAs,
						rotationKeys: rotationKeys,
						services: credentials.services,
						verificationMethods: credentials.verificationMethods,
					},
				}),
			);

			// Submit via the destination PDS
			await ok(
				destClient.post('com.atproto.identity.submitPlcOperation', {
					as: null,
					input: {
						operation: signage.operation,
					},
				}),
			);
		},
		onSuccess() {
			setPlcToken('');
		},
		onError(err) {
			console.error(err);
		},
	});

	// Calculate rotation key counts
	const pdsKeyCount = () => loadCredentialsMutation.data?.rotationKeys?.length ?? 0;
	const totalKeyCount = () => {
		const custom = customKeys().filter((k) => k.trim()).length;
		const generated = useGeneratedKey() && generateKeyMutation.data ? 1 : 0;
		return pdsKeyCount() + custom + generated;
	};
	const canAddCustomKey = () => totalKeyCount() < 5;
	const isOverLimit = () => totalKeyCount() > 5;

	const addCustomKey = () => {
		if (canAddCustomKey()) {
			setCustomKeys([...customKeys(), '']);
		}
	};

	const removeCustomKey = (index: number) => {
		setCustomKeys(customKeys().filter((_, i) => i !== index));
	};

	const updateCustomKey = (index: number, value: string) => {
		setCustomKeys(customKeys().map((k, i) => (i === index ? value : k)));
	};

	const canSignAndSubmit = () => {
		const src = source();
		const dest = destination();
		const creds = loadCredentialsMutation.data;
		const token = plcToken().trim();

		return !!(src?.manager && dest?.manager && creds && token && !isOverLimit());
	};

	const handleSignAndSubmit = () => {
		const src = source();
		const dest = destination();
		const creds = loadCredentialsMutation.data;
		const token = plcToken().trim();

		if (!src?.manager || !dest?.manager || !creds || !token || isOverLimit()) return;

		signAndSubmitMutation.mutate({
			sourceManager: src.manager,
			destManager: dest.manager,
			token,
			credentials: creds,
			generatedKey: useGeneratedKey() ? generateKeyMutation.data : undefined,
			customKeys: customKeys(),
		});
	};

	const getSubmitErrorMessage = () => {
		const err = signAndSubmitMutation.error;
		if (err instanceof ClientResponseError) {
			if (err.error === 'InvalidToken' || err.error === 'ExpiredToken') {
				return 'Confirmation code has expired or is invalid';
			}
		}
		return `${err}`;
	};

	return (
		<Accordion title="Identity (PLC)">
			<div class="mb-4 rounded border border-yellow-300 bg-yellow-50 p-3">
				<p class="text-sm font-medium text-yellow-800">
					This updates your DID document to point to the new PDS. This is the critical step that makes the
					migration official.
				</p>
			</div>

			<Subsection title="1. Preview new credentials">
				<p class="text-sm text-gray-600">View what your DID document will look like after the migration.</p>

				<Show
					when={destination()?.manager}
					fallback={<p class="text-sm text-gray-500">Sign in to destination account first.</p>}
				>
					{(manager) => (
						<>
							<div class="flex items-center gap-3">
								<Button
									variant="outline"
									onClick={() => loadCredentialsMutation.mutate({ manager: manager() })}
									disabled={loadCredentialsMutation.isPending}
								>
									{loadCredentialsMutation.isPending ? 'Loading...' : 'Load credentials'}
								</Button>

								<Show when={loadCredentialsMutation.isSuccess}>
									<StatusBadge variant="success">Loaded</StatusBadge>
								</Show>
							</div>

							<Show when={loadCredentialsMutation.isError}>
								<p class="text-sm text-red-600">{`${loadCredentialsMutation.error}`}</p>
							</Show>

							<Show when={loadCredentialsMutation.data}>
								{(creds) => (
									<>
										<div class="mt-2 text-sm">
											<p class="text-gray-500">
												Destination PDS rotation keys ({creds().rotationKeys?.length ?? 0}/5):
											</p>
											<div class="mt-1 flex flex-col gap-1">
												<For each={creds().rotationKeys ?? []}>
													{(key) => <code class="block truncate text-xs text-gray-700">{key}</code>}
												</For>
											</div>
										</div>

										<Show when={source()?.manager && source()}>
											{(src) => (
												<div class="mt-3 rounded border border-blue-200 bg-blue-50 p-3">
													<div class="flex items-center justify-between">
														<p class="text-sm font-medium text-blue-800">Analyze existing rotation keys</p>
														<Button
															variant="outline"
															onClick={() =>
																analyzeRotationKeysMutation.mutate({
																	did: src().did as Did<'plc'>,
																	sourceManager: src().manager!,
																})
															}
															disabled={analyzeRotationKeysMutation.isPending}
														>
															{analyzeRotationKeysMutation.isPending ? 'Analyzing...' : 'Analyze'}
														</Button>
													</div>
													<p class="mt-1 text-xs text-blue-600">
														Check if you have any user-controlled rotation keys that should be preserved
														during migration.
													</p>

													<Show when={analyzeRotationKeysMutation.error}>
														<p class="mt-2 text-sm text-red-600">{`${analyzeRotationKeysMutation.error}`}</p>
													</Show>

													<Show when={analyzeRotationKeysMutation.data}>
														{(analysis) => (
															<div class="mt-2 text-sm">
																<Show
																	when={analysis().userControlledKeys.length > 0}
																	fallback={
																		<p class="text-blue-700">
																			No user-controlled rotation keys found. Your current keys are all
																			managed by your source PDS.
																		</p>
																	}
																>
																	<p class="font-medium text-blue-800">
																		Found {analysis().userControlledKeys.length} user-controlled key(s) to
																		preserve:
																	</p>
																	<div class="mt-1 flex flex-col gap-1">
																		<For each={analysis().userControlledKeys}>
																			{(key) => (
																				<code class="block truncate text-xs text-blue-700">{key}</code>
																			)}
																		</For>
																	</div>
																	<p class="mt-2 text-xs text-blue-600">
																		These keys have been added to the custom keys section below.
																	</p>
																</Show>
															</div>
														)}
													</Show>
												</div>
											)}
										</Show>

										<details class="mt-2">
											<summary class="cursor-pointer text-sm text-gray-600">View full credentials</summary>
											<pre class="mt-2 max-h-48 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 font-mono text-xs">
												{JSON.stringify(creds(), null, 2)}
											</pre>
										</details>
									</>
								)}
							</Show>
						</>
					)}
				</Show>
			</Subsection>

			<Subsection title="2. Rotation keys (optional)">
				<p class="text-sm text-gray-600">
					Add a rotation key to recover your account if your new PDS goes rogue. This will be prepended to the
					PDS rotation keys shown above.
				</p>

				<ToggleInput
					label="Generate a new rotation key"
					checked={useGeneratedKey()}
					onChange={(checked) => {
						setUseGeneratedKey(checked);
						// Auto-generate if checked and no key exists yet
						if (checked && !generateKeyMutation.data && !generateKeyMutation.isPending) {
							generateKeyMutation.mutate();
						}
					}}
				/>

				<Show when={useGeneratedKey() && generateKeyMutation.isPending}>
					<p class="mt-2 text-sm text-gray-500">Generating key...</p>
				</Show>

				<Show when={useGeneratedKey() && generateKeyMutation.isError}>
					<p class="mt-2 text-sm text-red-600">{`${generateKeyMutation.error}`}</p>
				</Show>

				<Show when={useGeneratedKey() && generateKeyMutation.data}>
					{(keypair) => (
						<div class="rounded border border-green-300 bg-green-50 p-3">
							<p class="mb-2 text-sm font-semibold text-green-800">Save your rotation key private key!</p>
							<p class="mb-3 text-xs text-green-700">
								Store this securely. You'll need it to recover your account if your PDS becomes unavailable or
								malicious.
							</p>

							<div class="flex flex-col gap-2 text-sm">
								<div>
									<p class="font-medium text-gray-600">Public key (did:key)</p>
									<p class="break-all font-mono text-xs">{keypair().publicDidKey}</p>
								</div>
								<div>
									<p class="font-medium text-gray-600">Private key (hex)</p>
									<p class="break-all font-mono text-xs">{keypair().privateHex}</p>
								</div>
								<div>
									<p class="font-medium text-gray-600">Private key (multikey)</p>
									<p class="break-all font-mono text-xs">{keypair().privateMultikey}</p>
								</div>
							</div>
						</div>
					)}
				</Show>

				<div class="rounded border border-gray-200 bg-gray-50 p-3">
					<p class="mb-2 text-sm font-medium text-gray-700">Custom rotation keys</p>
					<p class="mb-3 text-xs text-gray-500">
						Add existing rotation keys (did:key format) you already control.
					</p>

					<Index each={customKeys()}>
						{(key, index) => (
							<div class="mb-2 flex items-center gap-2">
								<TextInput
									label=""
									placeholder="did:key:z..."
									monospace
									autocomplete="off"
									value={key()}
									onChange={(value) => updateCustomKey(index, value)}
								/>
								<button
									type="button"
									class="shrink-0 rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
									onClick={() => removeCustomKey(index)}
								>
									Remove
								</button>
							</div>
						)}
					</Index>

					<Button variant="outline" onClick={addCustomKey} disabled={!canAddCustomKey()}>
						Add rotation key
					</Button>

					<Show when={isOverLimit()}>
						<p class="mt-2 text-sm text-red-600">
							Too many rotation keys. PLC documents can only have up to 5 rotation keys total.
						</p>
					</Show>

					<p class="mt-2 text-xs text-gray-500">
						Total keys: {totalKeyCount()}/5 (PDS: {pdsKeyCount()}
						{useGeneratedKey() && generateKeyMutation.data ? ', generated: 1' : ''}
						{customKeys().filter((k) => k.trim()).length > 0
							? `, custom: ${customKeys().filter((k) => k.trim()).length}`
							: ''}
						)
					</p>
				</div>
			</Subsection>

			<Subsection title="3. Request operation signature">
				<p class="text-sm text-gray-600">Request a confirmation token via email from your source PDS.</p>

				<Show
					when={source()?.manager}
					fallback={<p class="text-sm text-gray-500">Sign in to source account first.</p>}
				>
					{(manager) => (
						<>
							<div class="flex items-center gap-3">
								<Button
									onClick={() => requestTokenMutation.mutate({ manager: manager() })}
									disabled={requestTokenMutation.isPending}
								>
									{requestTokenMutation.isPending ? 'Requesting...' : 'Request token'}
								</Button>

								<Show when={requestTokenMutation.isSuccess}>
									<StatusBadge variant="success">Email sent</StatusBadge>
								</Show>
							</div>

							<Show when={requestTokenMutation.isError}>
								<p class="text-sm text-red-600">{`${requestTokenMutation.error}`}</p>
							</Show>

							<Show when={requestTokenMutation.isSuccess}>
								<p class="text-sm text-gray-600">Check your email inbox for the confirmation code.</p>
							</Show>
						</>
					)}
				</Show>
			</Subsection>

			<Subsection title="4. Sign and submit">
				<p class="text-sm text-gray-600">Enter the confirmation code and submit the PLC operation.</p>

				<Show when={!source()?.manager || !destination()?.manager}>
					<p class="text-sm text-gray-500">Sign in to both source and destination accounts first.</p>
				</Show>

				<Show when={!loadCredentialsMutation.data}>
					<p class="text-sm text-gray-500">Load credentials first.</p>
				</Show>

				<Show when={useGeneratedKey() && !generateKeyMutation.data}>
					<p class="text-sm text-gray-500">Generate your rotation key first.</p>
				</Show>

				<Show when={source()?.manager && destination()?.manager && loadCredentialsMutation.data}>
					<TextInput
						label="Confirmation code from email"
						type="text"
						autocomplete="one-time-code"
						pattern={TOTP_RE.source}
						placeholder="AAAAA-BBBBB"
						value={plcToken()}
						onChange={setPlcToken}
						monospace
					/>

					<div class="flex items-center gap-3">
						<Button
							onClick={handleSignAndSubmit}
							disabled={signAndSubmitMutation.isPending || !canSignAndSubmit()}
						>
							{signAndSubmitMutation.isPending ? 'Submitting...' : 'Sign and submit'}
						</Button>

						<Show when={signAndSubmitMutation.isSuccess}>
							<StatusBadge variant="success">Identity updated successfully</StatusBadge>
						</Show>
					</div>

					<Show when={signAndSubmitMutation.isError}>
						<p class="text-sm text-red-600">{getSubmitErrorMessage()}</p>
					</Show>
				</Show>
			</Subsection>
		</Accordion>
	);
};

export default IdentitySection;
