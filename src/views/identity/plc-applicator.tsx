import { createEffect, createSignal, JSX, Match, onCleanup, Show, Switch } from 'solid-js';
import { createMutable, unwrap } from 'solid-js/store';

import * as CBOR from '@atcute/cbor';
import { AtpSessionData, CredentialManager, XRPC, XRPCError } from '@atcute/client';
import { At, ComAtprotoIdentityGetRecommendedDidCredentials } from '@atcute/client/lexicons';

import { P256Keypair, Secp256k1Keypair, verifySignature } from '@atproto/crypto';
import * as uint8arrays from 'uint8arrays';

import { getDidDocument } from '~/api/queries/did-doc';
import { resolveHandleViaAppView } from '~/api/queries/handle';
import { getPlcAuditLogs } from '~/api/queries/plc';
import { DidDocument, getPdsEndpoint } from '~/api/types/did-doc';
import { PlcLogEntry, PlcUpdateOp, PlcUpdatePayload, updatePayload } from '~/api/types/plc';
import { DID_OR_HANDLE_RE, isDid } from '~/api/utils/strings';

import { history } from '~/globals/navigation';

import { useTitle } from '~/lib/navigation/router';
import { assert } from '~/lib/utils/invariant';

const EMAIL_OTP_RE = /^([a-zA-Z0-9]{5})[\- ]?([a-zA-Z0-9]{5})$/;

const PlcUpdatePage = () => {
	const [step, setStep] = createSignal(1);
	const [pending, setPending] = createSignal(false);

	const [error, setError] = createSignal<{ step: number; message: string }>();

	const states = createMutable<{
		didDoc?: DidDocument;
		logs?: Awaited<ReturnType<typeof getPlcKeying>>;

		rotationKeyType?: 'owned' | 'pds';
		ownedRotationKey?: {
			keypair: P256Keypair | Secp256k1Keypair;
			didPublicKey: string;
		};
		pdsData?: {
			service: string;
			session: AtpSessionData;
			rpc: XRPC;
			recommendedDidDoc: ComAtprotoIdentityGetRecommendedDidCredentials.Output;
		};
		accountHasOtp?: boolean;

		prev?: PlcLogEntry;
		payload?: PlcUpdatePayload;
	}>({});

	useTitle(() => `Apply PLC operations — boat`);

	createEffect(() => {
		const $step = step();
		if (($step > 1 && $step < 6) || pending()) {
			const cleanup = history.block((tx) => {
				if (window.confirm(`Abort this action?`)) {
					cleanup();
					tx.retry();
				}
			});

			onCleanup(cleanup);
		}
	});

	return (
		<fieldset disabled={pending()} class="contents">
			<div class="p-4">
				<h1 class="text-lg font-bold text-purple-800">Apply PLC operations</h1>
				<p class="text-gray-600">Submit operations to your did:plc identity</p>
			</div>
			<hr class="mx-4 border-gray-300" />

			<StepPage
				step={1}
				title="Enter the did:plc identity you want to edit"
				current={step()}
				onSubmit={async (form) => {
					try {
						setPending(true);
						setError();

						const identifier = form.get('ident') as string;
						const rotation = form.get('rotation') as 'owned' | 'pds';

						let did: At.DID;
						if (isDid(identifier)) {
							did = identifier;
						} else {
							did = await resolveHandleViaAppView({ handle: identifier });
						}

						if (!did.startsWith('did:plc:')) {
							setError({ step: 1, message: `"${did}" is not did:plc` });
							return;
						}

						const [didDoc, logs] = await Promise.all([getDidDocument({ did }), getPlcAuditLogs({ did })]);

						states.didDoc = didDoc;
						states.logs = await getPlcKeying(logs);

						states.rotationKeyType = rotation;

						if (rotation === 'owned') {
							states.pdsData = undefined;
						} else if (rotation === 'pds') {
							states.ownedRotationKey = undefined;
						}

						if (states.pdsData) {
							if (states.pdsData.session.did !== did) {
								states.pdsData = undefined;
								states.accountHasOtp = false;
							}
						}

						setStep(2);
					} catch (err) {
						console.error(err);
						setError({ step: 1, message: `Something went wrong: ${err}` });
					} finally {
						setPending(false);
					}
				}}
			>
				<label class="flex flex-col gap-2">
					<span class="font-semibold text-gray-600">Handle or DID identifier</span>
					<input
						ref={(node) => {
							createEffect(() => {
								if (step() === 1) {
									setTimeout(() => node.focus(), 1);
								}
							});
						}}
						type="text"
						name="ident"
						required
						pattern={/* @once */ DID_OR_HANDLE_RE.source}
						placeholder="paul.bsky.social"
						class="rounded border border-gray-400 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-purple-800 focus:ring-1 focus:ring-purple-800 focus:ring-offset-0"
					/>
				</label>

				<fieldset class="mt-6 flex flex-col gap-2">
					<span class="font-semibold text-gray-600">I will be using...</span>

					<label class="flex items-center gap-3">
						<input
							type="radio"
							name="rotation"
							required
							value="pds"
							class="border-gray-400 text-purple-800 focus:ring-purple-800"
						/>
						<span class="text-sm">my PDS' rotation key (requires sign in)</span>
					</label>

					<label class="flex items-center gap-3">
						<input
							type="radio"
							name="rotation"
							required
							value="owned"
							class="border-gray-400 text-purple-800 focus:ring-purple-800"
						/>
						<span class="text-sm">my own rotation key</span>
					</label>
				</fieldset>

				<ErrorMessageView step={1} error={error()} />

				<div hidden={step() !== 1} class="mt-6 flex flex-wrap gap-4">
					<div class="grow"></div>

					<button
						type="submit"
						class="flex h-9 select-none items-center rounded bg-purple-800 px-4 text-sm font-semibold text-white hover:bg-purple-700 active:bg-purple-700"
					>
						Next
					</button>
				</div>
			</StepPage>

			<Switch>
				<Match when={states.rotationKeyType === 'pds'}>
					<StepPage
						step={2}
						title="Sign in to your PDS"
						current={step()}
						onSubmit={async (form) => {
							if (states.pdsData) {
								setStep(3);
								return;
							}

							assert(states.didDoc);

							try {
								setPending(true);
								setError();

								const service = form.get('service') as string;
								const pass = form.get('pass') as string;
								const otp = form.get('otp') as string | null;

								const manager = new CredentialManager({ service });
								const session = await manager.login({
									identifier: states.didDoc.id,
									password: pass,
									code: otp ? formatEmailOtpCode(otp) : undefined,
								});

								const rpc = new XRPC({ handler: manager });
								const { data: recommendedDidDoc } = await rpc.get(
									'com.atproto.identity.getRecommendedDidCredentials',
									{},
								);

								const data = {
									service,
									session,
									recommendedDidDoc,
									rpc,
								};

								states.pdsData = data;
								states.accountHasOtp = false;

								setStep(3);
							} catch (err) {
								let msg: string | undefined;

								if (err instanceof XRPCError) {
									if (err.kind === 'AuthFactorTokenRequired') {
										states.accountHasOtp = true;
										return;
									}

									if (err.kind === 'AuthenticationRequired') {
										msg = `Invalid identifier or password`;
									} else if (err.kind === 'AccountTakedown') {
										msg = `Account has been taken down`;
									} else if (err.message.includes('Token is invalid')) {
										msg = `Invalid one-time confirmation code`;
										states.accountHasOtp = true;
									}
								}

								if (msg !== undefined) {
									setError({ step: 2, message: msg });
								} else {
									console.error(err);
									setError({ step: 2, message: `Something went wrong: ${err}` });
								}
							} finally {
								setPending(false);
							}
						}}
					>
						<Show when={states.pdsData}>
							{(session) => (
								<p class="break-words">
									Signed in via <b>{session().service}</b>.{' '}
									<button
										type="button"
										onClick={() => (states.pdsData = undefined)}
										hidden={step() !== 2}
										class="text-purple-800 hover:underline disabled:pointer-events-none"
									>
										Sign out?
									</button>
								</p>
							)}
						</Show>

						<Show when={!states.pdsData}>
							<label class="flex flex-col gap-2">
								<span class="font-semibold text-gray-600">PDS service</span>
								<input
									type="url"
									name="service"
									required
									value={(states.didDoc && getPdsEndpoint(states.didDoc)) || ''}
									placeholder="https://bsky.social"
									class="rounded border border-gray-400 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-purple-800 focus:ring-1 focus:ring-purple-800 focus:ring-offset-0"
								/>
							</label>

							<label class="mt-6 flex flex-col gap-2">
								<span class="font-semibold text-gray-600">Main password</span>
								<input
									ref={(node) => {
										createEffect(() => {
											if (step() === 2) {
												setTimeout(() => node.focus(), 1);
											}
										});
									}}
									type="password"
									name="pass"
									required
									class="rounded border border-gray-400 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-purple-800 focus:ring-1 focus:ring-purple-800 focus:ring-offset-0"
								/>
							</label>

							<Show when={states.accountHasOtp}>
								<label class="mt-6 flex flex-col gap-2">
									<span class="font-semibold text-gray-600">One-time confirmation code</span>
									<input
										type="text"
										name="otp"
										required
										autocomplete="one-time-code"
										pattern={/* @once */ EMAIL_OTP_RE.source}
										placeholder="AAAAA-BBBBB"
										class="rounded border border-gray-400 px-3 py-2 font-mono text-sm tracking-wide placeholder:text-gray-400 focus:border-purple-800 focus:ring-1 focus:ring-purple-800 focus:ring-offset-0"
									/>
								</label>
							</Show>

							<p class="mt-2 text-[0.8125rem] leading-5 text-gray-500">
								This app runs locally on your browser, your credentials stays entirely within your device.
							</p>
						</Show>

						<ErrorMessageView step={2} error={error()} />

						<div hidden={step() !== 2} class="mt-6 flex flex-wrap gap-4">
							<div class="grow"></div>

							<button
								type="button"
								onClick={() => setStep(1)}
								class="flex h-9 select-none items-center rounded bg-gray-200 px-4 text-sm font-semibold text-black hover:bg-gray-300 active:bg-gray-300"
							>
								Previous
							</button>

							<button
								type="submit"
								class="flex h-9 select-none items-center rounded bg-purple-800 px-4 text-sm font-semibold text-white hover:bg-purple-700 active:bg-purple-700"
							>
								Next
							</button>
						</div>
					</StepPage>
				</Match>

				<Match when={states.rotationKeyType === 'owned'}>
					<StepPage
						step={2}
						title="Enter your private key"
						current={step()}
						onSubmit={async (form) => {
							try {
								setPending(true);
								setError();

								const key = form.get('key') as string;
								const type = form.get('type') as 'secp256k1' | 'nistp256';

								let keypair: P256Keypair | Secp256k1Keypair;

								if (type === 'nistp256') {
									keypair = await P256Keypair.import(key);
								} else if (type === 'secp256k1') {
									keypair = await Secp256k1Keypair.import(key);
								} else {
									throw new Error(`unsupported '${type}' type`);
								}

								states.ownedRotationKey = { didPublicKey: keypair.did(), keypair: keypair };

								setStep(3);
							} catch (err) {
								let msg: string | undefined;

								if (msg !== undefined) {
									setError({ step: 2, message: msg });
								} else {
									console.error(err);
									setError({ step: 2, message: `Something went wrong: ${err}` });
								}
							} finally {
								setPending(false);
							}
						}}
					>
						<label class="flex flex-col gap-2">
							<span class="font-semibold text-gray-600">Hex-encoded private key</span>
							<input
								ref={(node) => {
									createEffect(() => {
										if (step() === 2) {
											setTimeout(() => node.focus(), 1);
										}
									});
								}}
								type={step() === 2 ? 'text' : 'password'}
								name="key"
								required
								autocomplete="off"
								autocorrect="off"
								placeholder="a5973930f9d348..."
								pattern="[0-9a-f]+"
								class="rounded border border-gray-400 px-3 py-2 font-mono text-sm placeholder:text-gray-400 focus:border-purple-800 focus:ring-1 focus:ring-purple-800 focus:ring-offset-0"
							/>
						</label>
						<p hidden={step() !== 2} class="mt-2 text-[0.8125rem] leading-5 text-gray-500">
							This app runs locally on your browser, your private key stays entirely within your device.
						</p>

						<fieldset class="mt-6 flex flex-col gap-2">
							<span class="font-semibold text-gray-600">This is a...</span>

							<label class="flex items-start gap-3">
								<input
									type="radio"
									name="type"
									required
									value="secp256k1"
									class="border-gray-400 text-purple-800 focus:ring-purple-800"
								/>
								<span class="text-sm">ES256K (secp256k1) private key</span>
							</label>

							<label class="flex items-start gap-3">
								<input
									type="radio"
									name="type"
									required
									value="nistp256"
									class="border-gray-400 text-purple-800 focus:ring-purple-800"
								/>
								<span class="text-sm">ES256 (nistp256) private key</span>
							</label>
						</fieldset>

						<ErrorMessageView step={2} error={error()} />

						<div hidden={step() !== 2} class="mt-6 flex flex-wrap gap-4">
							<div class="grow"></div>

							<button
								type="button"
								onClick={() => setStep(1)}
								class="flex h-9 select-none items-center rounded bg-gray-200 px-4 text-sm font-semibold text-black hover:bg-gray-300 active:bg-gray-300"
							>
								Previous
							</button>

							<button
								type="submit"
								class="flex h-9 select-none items-center rounded bg-purple-800 px-4 text-sm font-semibold text-white hover:bg-purple-700 active:bg-purple-700"
							>
								Next
							</button>
						</div>
					</StepPage>
				</Match>
			</Switch>

			<StepPage
				step={3}
				title="Select which operation to use as foundation"
				current={step()}
				onSubmit={(form) => {
					setError();

					const cid = form.get('cid') as string;
					const entry = states.logs?.find((entry) => entry.cid === cid);

					if (!entry) {
						setError({ step: 3, message: `Can't find CID ${cid}` });
						return;
					}

					const op = entry.operation;
					if (op.type !== 'plc_operation' && op.type !== 'create') {
						setError({ step: 3, message: `Expected op to be 'plc_operation' or 'create'` });
						return;
					}

					states.prev = entry;
					states.payload = getPlcPayload(entry);

					setStep(4);
				}}
			>
				<label class="flex flex-col gap-2">
					<span class="font-semibold text-gray-600">Base operation</span>

					<select
						ref={(node) => {
							createEffect(() => {
								if (step() === 3) {
									setTimeout(() => node.focus(), 1);
								}
							});
						}}
						name="cid"
						value=""
						required
						class="rounded border border-gray-400 py-2 pl-3 pr-8 text-sm focus:border-purple-800 focus:ring-1 focus:ring-purple-800 focus:ring-offset-0"
					>
						<option value="">Select an operation...</option>
						{(() => {
							const logs = states.logs;
							if (!logs) {
								return null;
							}

							const rotationKeyType = states.rotationKeyType;

							let ownKey: string | undefined;
							if (rotationKeyType === 'pds') {
								ownKey = states.pdsData?.recommendedDidDoc.rotationKeys?.at(-1);
							} else if (rotationKeyType === 'owned') {
								ownKey = states.ownedRotationKey?.didPublicKey;
							}

							if (ownKey === undefined) {
								return [];
							}

							const length = logs.length;
							const nodes = logs.map((entry, idx) => {
								const signers = getCurrentSignersFromEntry(entry);
								const last = idx === length - 1;

								let enabled = signers.includes(ownKey!);

								// If we're showing older operations for forking/nullification,
								// check to see that our key has priority over the signer.
								if (enabled && !last) {
									if (rotationKeyType === 'pds') {
										// `signPlcOperation` will always grab the last op
										enabled = false;
									} else {
										const holderKey = logs[idx + 1].signedBy;

										const holderPriority = signers.indexOf(holderKey);
										const ownPriority = signers.indexOf(ownKey);

										enabled = ownPriority < holderPriority;
									}
								}

								return (
									<option disabled={!enabled} value={/* @once */ entry.cid}>
										{/* @once */ `${entry.createdAt} (by ${entry.signedBy})`}
									</option>
								);
							});

							return nodes.reverse();
						})()}
					</select>
				</label>

				<p class="mt-2 text-[0.8125rem] leading-5 text-gray-500">
					Some operations can't be used as a base if the rotation key does not have the privilege for
					nullification, or if it is not listed.
				</p>

				<ErrorMessageView step={3} error={error()} />

				<div hidden={step() !== 3} class="mt-6 flex flex-wrap gap-4">
					<div class="grow"></div>

					<button
						type="button"
						onClick={() => setStep(2)}
						class="flex h-9 select-none items-center rounded bg-gray-200 px-4 text-sm font-semibold text-black hover:bg-gray-300 active:bg-gray-300"
					>
						Previous
					</button>

					<button
						type="submit"
						class="flex h-9 select-none items-center rounded bg-purple-800 px-4 text-sm font-semibold text-white hover:bg-purple-700 active:bg-purple-700"
					>
						Next
					</button>
				</div>
			</StepPage>

			<StepPage
				step={4}
				title="Enter your payload"
				current={step()}
				onSubmit={(form) => {
					setError();

					const payload = form.get('payload') as string;

					let json: unknown;
					try {
						json = JSON.parse(payload);
					} catch {
						setError({ step: 4, message: `Unable to parse JSON` });
						return;
					}

					const result = updatePayload.try(json);
					if (!result.ok) {
						setError({ step: 4, message: result.message });
						return;
					}

					states.payload = result.value;

					setStep(5);
				}}
			>
				<label class="flex flex-col gap-2">
					<span class="font-semibold text-gray-600">Payload input</span>

					<textarea
						ref={(node) => {
							createEffect(() => {
								if (step() === 4) {
									setTimeout(() => node.focus(), 1);
								}
							});
						}}
						name="payload"
						required
						rows={22}
						value={JSON.stringify(states.payload, null, 2)}
						class="resize-y break-all rounded border border-gray-400 px-3 py-2 font-mono text-xs tracking-wider placeholder:text-gray-400 focus:border-purple-800 focus:ring-1 focus:ring-purple-800 focus:ring-offset-0"
						style="field-sizing: content"
					/>
				</label>

				<div hidden={step() !== 4} class="mt-2 flex flex-wrap gap-4">
					{states.pdsData && (
						<button
							type="button"
							onClick={() => {
								const entry = unwrap(states.prev);
								assert(entry !== undefined);

								const recommended = unwrap(states.pdsData!.recommendedDidDoc);
								const payload = getPlcPayload(entry);

								if (recommended.alsoKnownAs) {
									payload.alsoKnownAs = recommended.alsoKnownAs;
								}
								if (recommended.rotationKeys) {
									payload.rotationKeys = recommended.rotationKeys;
								}
								if (recommended.services) {
									// @ts-expect-error
									payload.services = recommended.services;
								}
								if (recommended.verificationMethods) {
									// @ts-expect-error
									payload.verificationMethods = recommended.verificationMethods;
								}

								states.payload = payload;
							}}
							class="text-[0.8125rem] leading-5 text-purple-800 hover:underline disabled:pointer-events-none"
						>
							Use PDS recommendation
						</button>
					)}

					<button
						type="button"
						onClick={() => {
							const entry = unwrap(states.prev);
							assert(entry !== undefined);

							const payload = getPlcPayload(entry);

							states.payload = payload;
						}}
						class="text-[0.8125rem] leading-5 text-purple-800 hover:underline disabled:pointer-events-none"
					>
						Reset to default
					</button>
				</div>

				<ErrorMessageView step={4} error={error()} />

				<div hidden={step() !== 4} class="mt-6 flex flex-wrap gap-4">
					<div class="grow"></div>

					<button
						type="button"
						onClick={() => setStep(3)}
						class="flex h-9 select-none items-center rounded bg-gray-200 px-4 text-sm font-semibold text-black hover:bg-gray-300 active:bg-gray-300"
					>
						Previous
					</button>

					<button
						type="submit"
						class="flex h-9 select-none items-center rounded bg-purple-800 px-4 text-sm font-semibold text-white hover:bg-purple-700 active:bg-purple-700"
					>
						Next
					</button>
				</div>
			</StepPage>

			<Switch>
				<Match when={states.rotationKeyType === 'pds'}>
					<StepPage
						step={5}
						title="One more step"
						current={step()}
						onSubmit={async (form) => {
							try {
								setPending(true);
								setError();

								const code = form.get('code') as string;

								const rpc = states.pdsData!.rpc;
								const payload = states.payload!;

								const { data: signage } = await rpc.call('com.atproto.identity.signPlcOperation', {
									data: {
										token: code,
										alsoKnownAs: payload.alsoKnownAs,
										rotationKeys: payload.rotationKeys,
										services: payload.services,
										verificationMethods: payload.verificationMethods,
									},
								});

								await rpc.call('com.atproto.identity.submitPlcOperation', {
									data: {
										operation: signage.operation,
									},
								});

								setStep(6);
							} catch (err) {
								let msg: string | undefined;

								if (err instanceof XRPCError) {
									if (err.kind === 'InvalidToken' || err.kind === 'ExpiredToken') {
										msg = `Confirmation code has expired`;
									}
								}

								if (msg !== undefined) {
									setError({ step: 5, message: msg });
								} else {
									console.error(err);
									setError({ step: 5, message: `Something went wrong: ${err}` });
								}
							} finally {
								setPending(false);
							}
						}}
					>
						<p>
							To continue with this submission, you will need to request a confirmation code from your PDS.
							This code will be sent to your account's email address.
						</p>

						<label class="mt-6 flex flex-col gap-2">
							<span class="font-semibold text-gray-600">One-time confirmation code</span>
							<input
								ref={(node) => {
									createEffect(() => {
										if (step() === 5) {
											setTimeout(() => node.focus(), 1);
										}
									});
								}}
								type="text"
								name="code"
								required
								autocomplete="one-time-code"
								pattern={/* @once */ EMAIL_OTP_RE.source}
								placeholder="AAAAA-BBBBB"
								class="rounded border border-gray-400 px-3 py-2 font-mono text-sm tracking-wide placeholder:text-gray-400 focus:border-purple-800 focus:ring-1 focus:ring-purple-800 focus:ring-offset-0"
							/>
						</label>

						<div hidden={step() !== 5} class="mt-2 flex flex-wrap gap-4">
							<button
								type="button"
								onClick={async () => {
									try {
										const rpc = states.pdsData!.rpc;

										await rpc.call('com.atproto.identity.requestPlcOperationSignature', {});
										alert(`Confirmation code has been sent, check your email inbox.`);
									} catch (err) {
										let msg: string | undefined;

										if (err instanceof XRPCError) {
											if (err.message.includes(`does not have an email address`)) {
												msg = `Account does not have an email address`;
											} else if (err.message.includes(`not found`)) {
												msg = `Account is not registered on the PDS`;
											}
										}

										if (msg !== undefined) {
											setError({ step: 5, message: msg });
										} else {
											console.error(err);
											setError({ step: 5, message: `Something went wrong: ${err}` });
										}
									}
								}}
								class="text-[0.8125rem] leading-5 text-purple-800 hover:underline disabled:pointer-events-none"
							>
								Request confirmation code
							</button>
						</div>

						<p class="mt-6">
							Now, relax. Take a breather. Verify that you have provided the intended payload, and hit{' '}
							<i>Submit</i> when you're ready.
						</p>

						<p class="mt-3 text-[0.8125rem] font-medium leading-5 text-red-800">
							Caution: This action carries significant risk which can possibly render your did:plc identity
							unusable. Proceed at your own risk, we assume no liability for any consequences.
						</p>

						<label class="mt-6 flex items-start gap-3">
							<input
								type="checkbox"
								name="confirm"
								required
								class="rounded border-gray-400 text-purple-800 focus:ring-purple-800"
							/>
							<span class="text-sm">I have verified and am ready to proceed</span>
						</label>

						<ErrorMessageView step={5} error={error()} />

						<div hidden={step() !== 5} class="mt-6 flex flex-wrap gap-4">
							<div class="grow"></div>

							<button
								type="button"
								onClick={() => setStep(4)}
								class="flex h-9 select-none items-center rounded bg-gray-200 px-4 text-sm font-semibold text-black hover:bg-gray-300 active:bg-gray-300"
							>
								Previous
							</button>

							<button
								type="submit"
								class="flex h-9 select-none items-center rounded bg-purple-800 px-4 text-sm font-semibold text-white hover:bg-purple-700 active:bg-purple-700"
							>
								Submit
							</button>
						</div>
					</StepPage>
				</Match>

				<Match when={states.rotationKeyType === 'owned'}>
					<StepPage
						step={5}
						title="One more step"
						current={step()}
						onSubmit={async () => {
							try {
								setPending(true);
								setError();

								const keypair = states.ownedRotationKey!.keypair;
								const payload = states.payload!;
								const prev = states.prev!;

								const operation: Omit<PlcUpdateOp, 'sig'> = {
									type: 'plc_operation',
									prev: prev!.cid,

									alsoKnownAs: payload.alsoKnownAs,
									rotationKeys: payload.rotationKeys,
									services: payload.services,
									verificationMethods: payload.verificationMethods,
								};

								const opBytes = CBOR.encode(operation);
								const sigBytes = await keypair.sign(opBytes);

								const signature = uint8arrays.toString(sigBytes, 'base64url');

								const signedOperation: PlcUpdateOp = {
									...operation,
									sig: signature,
								};

								await pushPlcOperation(states.didDoc!.id, signedOperation);

								setStep(6);
							} catch (err) {
								let msg: string | undefined;

								if (msg !== undefined) {
									setError({ step: 5, message: msg });
								} else {
									console.error(err);
									setError({ step: 5, message: `Something went wrong: ${err}` });
								}
							} finally {
								setPending(false);
							}
						}}
					>
						<p>
							Now, relax. Take a breather. Verify that you have provided the intended payload, and hit{' '}
							<i>Submit</i> when you're ready.
						</p>

						<p class="mt-3 text-[0.8125rem] font-medium leading-5 text-red-800">
							Caution: This action carries significant risk which can possibly render your did:plc identity
							unusable. Proceed at your own risk, we assume no liability for any consequences.
						</p>

						<label class="mt-6 flex items-start gap-3">
							<input
								ref={(node) => {
									createEffect(() => {
										if (step() === 5) {
											setTimeout(() => node.focus(), 1);
										}
									});
								}}
								type="checkbox"
								name="confirm"
								required
								class="rounded border-gray-400 text-purple-800 focus:ring-purple-800"
							/>
							<span class="text-sm">I have verified and am ready to proceed</span>
						</label>

						<ErrorMessageView step={5} error={error()} />

						<div hidden={step() !== 5} class="mt-6 flex flex-wrap gap-4">
							<div class="grow"></div>

							<button
								type="button"
								onClick={() => setStep(4)}
								class="flex h-9 select-none items-center rounded bg-gray-200 px-4 text-sm font-semibold text-black hover:bg-gray-300 active:bg-gray-300"
							>
								Previous
							</button>

							<button
								type="submit"
								class="flex h-9 select-none items-center rounded bg-purple-800 px-4 text-sm font-semibold text-white hover:bg-purple-700 active:bg-purple-700"
							>
								Submit
							</button>
						</div>
					</StepPage>
				</Match>
			</Switch>

			<StepPage step={6} title="All done!" current={step()} onSubmit={() => {}}>
				<p>Your did:plc identity has been updated.</p>

				<p class="mt-3">
					You can close this page, or reload the page if you intend on doing another submission.
				</p>
			</StepPage>

			<div class="pb-24"></div>
		</fieldset>
	);
};

export default PlcUpdatePage;

const pushPlcOperation = async (did: string, operation: PlcUpdateOp) => {
	const origin = import.meta.env.VITE_PLC_DIRECTORY_URL;
	const response = await fetch(`${origin}/${did}`, {
		method: 'post',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify(operation),
	});

	const headers = response.headers;
	if (!response.ok) {
		const type = headers.get('content-type');

		if (type?.includes('application/json')) {
			const json = await response.json();
			if (typeof json === 'object' && json !== null && typeof json.message === 'string') {
				throw new Error(json.message);
			}
		}

		throw new Error(`got http ${response.status} from plc`);
	}
};

const formatEmailOtpCode = (code: string) => {
	code = code.toUpperCase();

	const match = EMAIL_OTP_RE.exec(code);
	if (match !== null) {
		return `${match[1]}-${match[2]}`;
	}

	return '';
};

const getPlcPayload = (entry: PlcLogEntry): PlcUpdatePayload => {
	const op = entry.operation;
	assert(op.type === 'plc_operation' || op.type === 'create');

	if (op.type === 'create') {
		return {
			alsoKnownAs: [`at://${op.handle}`],
			rotationKeys: [op.recoveryKey, op.signingKey],
			verificationMethods: {
				atproto: op.signingKey,
			},
			services: {
				atproto_pds: {
					type: 'AtprotoPersonalDataServer',
					endpoint: op.service,
				},
			},
		};
	} else if (op.type === 'plc_operation') {
		return {
			alsoKnownAs: op.alsoKnownAs,
			rotationKeys: op.rotationKeys,
			services: op.services,
			verificationMethods: op.verificationMethods,
		};
	}

	assert(false);
};

const getPlcKeying = async (logs: PlcLogEntry[]) => {
	logs = logs.filter((entry) => !entry.nullified);

	const length = logs.length;
	const promises = logs.map(async (entry, idx) => {
		const operation = entry.operation;
		if (operation.type === 'plc_tombstone') {
			return;
		}

		// If it's not the last entry, check if the next entry ahead of this one
		// was made within the last 72 hours.
		if (idx !== length - 1) {
			const next = logs[idx + 1]!;
			const date = new Date(next.createdAt);
			const diff = Date.now() - date.getTime();

			if (diff / (1_000 * 60 * 60) > 72) {
				return;
			}
		}

		/** keys that potentially signed this operation */
		let signers: string[] | undefined;
		if (operation.prev === null) {
			if (operation.type === 'create') {
				signers = [operation.recoveryKey, operation.signingKey];
			} else if (operation.type === 'plc_operation') {
				signers = operation.rotationKeys;
			}
		} else {
			const prev = logs[idx - 1];
			assert(prev !== undefined, `missing previous entry from ${entry.createdAt}`);
			assert(prev.cid === operation.prev, `prev cid mismatch on ${entry.createdAt}`);

			const prevOp = prev.operation;

			if (prevOp.type === 'create') {
				signers = [prevOp.recoveryKey, prevOp.signingKey];
			} else if (prevOp.type === 'plc_operation') {
				signers = prevOp.rotationKeys;
			}
		}

		assert(signers !== undefined, `no signers found for ${entry.createdAt}`);

		const opBytes = CBOR.encode({ ...operation, sig: undefined });
		const sigBytes = uint8arrays.fromString(operation.sig, 'base64url');

		/** key that signed this operation */
		let signedBy: string | undefined;
		for (const key of signers) {
			const valid = await verifySignature(key, opBytes, sigBytes);
			if (valid) {
				signedBy = key;
				break;
			}
		}

		assert(signedBy !== undefined, `no valid signer for ${entry.createdAt}`);

		return {
			...entry,
			signers,
			signedBy,
		};
	});

	const fulfilled = await Promise.all(promises);
	return fulfilled.filter((entry) => entry !== undefined);
};

const getCurrentSignersFromEntry = (entry: PlcLogEntry): string[] => {
	const operation = entry.operation;

	/** keys that can sign the next operation */
	let nextSigners: string[] | undefined;
	if (operation.type === 'create') {
		nextSigners = [operation.recoveryKey, operation.signingKey];
	} else if (operation.type === 'plc_operation') {
		nextSigners = operation.rotationKeys;
	}

	assert(nextSigners !== undefined, `no signers found for ${entry.createdAt}`);
	return nextSigners;
};

const ErrorMessageView = (props: { step: number; error: { step: number; message: string } | undefined }) => {
	return (
		<Show
			when={(() => {
				const error = props.error;
				if (error && props.step === error.step) {
					return error;
				}
			})()}
		>
			{(error) => (
				<p class="mt-4 whitespace-pre-wrap text-[0.8125rem] font-medium leading-5 text-red-800">
					{error().message}
				</p>
			)}
		</Show>
	);
};

const StepPage = (props: {
	step: number;
	title: string;
	current: number;
	onSubmit: (formData: FormData) => void;
	children: JSX.Element;
}) => {
	const onSubmit = props.onSubmit;

	const handleSubmit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = (ev) => {
		ev.preventDefault();

		const formData = new FormData(ev.currentTarget);
		onSubmit(formData);
	};

	return (
		<Show when={props.step <= props.current}>
			<form onSubmit={handleSubmit} class="contents">
				<fieldset disabled={props.step !== props.current} class="flex min-w-0 gap-4 px-4 disabled:opacity-50">
					<div class="flex flex-col items-center gap-1 pt-4">
						<div class="grid h-6 w-6 place-items-center rounded-full bg-gray-200 py-1 text-center text-sm font-medium leading-none text-black">
							{'' + props.step}
						</div>

						<div hidden={!(props.current > props.step)} class="-mb-3 grow border-l border-gray-400"></div>
					</div>

					<div class="min-w-0 grow py-4">
						<h3 class="mb-[1.125rem] mt-0.5 text-sm font-semibold">{props.title}</h3>
						{props.children}
					</div>
				</fieldset>
			</form>
		</Show>
	);
};
