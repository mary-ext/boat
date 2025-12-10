import { createSignal, Show } from 'solid-js';

import {
	type AtpAccessJwt,
	Client,
	ClientResponseError,
	CredentialManager,
	ok,
	simpleFetchHandler,
} from '@atcute/client';
import type { Did, Handle } from '@atcute/lexicons/syntax';

import { formatTotpCode, TOTP_RE } from '~/api/utils/auth';
import { decodeJwt } from '~/api/utils/jwt';
import { isServiceUrlString } from '~/api/types/strings';

import { createMutation } from '~/lib/utils/mutation';

import { Accordion, StatusBadge, Subsection } from '~/components/accordion';
import Button from '~/components/inputs/button';
import TextInput from '~/components/inputs/text-input';

import { useMigration } from '../context';

class InsufficientLoginError extends Error {}

const DestinationAccountSection = () => {
	const { source, destination, setDestination } = useMigration();

	// Connect state
	const [pdsUrl, setPdsUrl] = createSignal('');
	const [connectError, setConnectError] = createSignal<string>();

	// Create account state
	const [newHandle, setNewHandle] = createSignal('');
	const [newEmail, setNewEmail] = createSignal('');
	const [newPassword, setNewPassword] = createSignal('');
	const [inviteCode, setInviteCode] = createSignal('');
	const [createError, setCreateError] = createSignal<string>();

	// Login state
	const [loginPassword, setLoginPassword] = createSignal('');
	const [loginOtp, setLoginOtp] = createSignal('');
	const [isLoginTotpRequired, setIsLoginTotpRequired] = createSignal(false);
	const [loginError, setLoginError] = createSignal<string>();

	const connectMutation = createMutation({
		async mutationFn({ pdsUrl }: { pdsUrl: string }) {
			const destClient = new Client({ handler: simpleFetchHandler({ service: pdsUrl }) });
			const desc = await ok(destClient.get('com.atproto.server.describeServer'));

			return { serviceDid: desc.did };
		},
		onMutate() {
			setConnectError();
		},
		onSuccess({ serviceDid }) {
			setDestination({ pdsUrl: pdsUrl(), serviceDid, manager: null });
		},
		onError(err) {
			console.error(err);
			setConnectError(`Failed to connect: ${err}`);
		},
	});

	const createAccountMutation = createMutation({
		async mutationFn({
			sourceDid,
			sourceManager,
			destPdsUrl,
			destServiceDid,
			handle,
			email,
			password,
			inviteCode,
		}: {
			sourceDid: Did;
			sourceManager: CredentialManager;
			destPdsUrl: string;
			destServiceDid: string;
			handle: Handle;
			email: string;
			password: string;
			inviteCode: string;
		}) {
			// Get service auth token from old PDS
			const sourceClient = new Client({ handler: sourceManager });
			const authResp = await ok(
				sourceClient.get('com.atproto.server.getServiceAuth', {
					params: {
						aud: destServiceDid as Did,
						lxm: 'com.atproto.server.createAccount',
					},
				}),
			);
			const serviceJwt = authResp.token;

			// Create account on new PDS with service auth
			const destClient = new Client({ handler: simpleFetchHandler({ service: destPdsUrl }) });
			const createResp = await destClient.post('com.atproto.server.createAccount', {
				headers: { Authorization: `Bearer ${serviceJwt}` },
				input: {
					did: sourceDid,
					handle: handle,
					email: email,
					password: password,
					inviteCode: inviteCode || undefined,
				},
			});

			if (!createResp.ok) {
				throw new ClientResponseError(createResp);
			}

			if (createResp.data.did !== sourceDid) {
				throw new Error(`Created account has different DID: ${createResp.data.did}`);
			}

			// Login to the new account
			const manager = new CredentialManager({ service: destPdsUrl });
			await manager.login({
				identifier: sourceDid,
				password: password,
			});

			return manager;
		},
		onMutate() {
			setCreateError();
		},
		onSuccess(manager) {
			setDestination({ ...destination()!, manager });
			setNewPassword('');
		},
		onError(err) {
			if (err instanceof ClientResponseError) {
				if (err.error === 'InvalidInviteCode') {
					setCreateError(`Invalid invite code`);
					return;
				}
				if (err.error === 'HandleNotAvailable') {
					setCreateError(`Handle is not available`);
					return;
				}
				if (err.description) {
					setCreateError(err.description);
					return;
				}
			}
			console.error(err);
			setCreateError(`${err}`);
		},
	});

	const loginMutation = createMutation({
		async mutationFn({
			pdsUrl,
			did,
			password,
			otp,
		}: {
			pdsUrl: string;
			did: string;
			password: string;
			otp: string;
		}) {
			const manager = new CredentialManager({ service: pdsUrl });
			const session = await manager.login({
				identifier: did,
				password: password,
				code: formatTotpCode(otp),
			});

			const decoded = decodeJwt(session.accessJwt) as AtpAccessJwt;
			if (decoded.scope !== 'com.atproto.access') {
				throw new InsufficientLoginError(`You need to sign in with a main password, not an app password`);
			}

			return manager;
		},
		onMutate() {
			setLoginError();
		},
		onSuccess(manager) {
			setDestination({ ...destination()!, manager });
			setLoginPassword('');
			setLoginOtp('');
			setIsLoginTotpRequired(false);
		},
		onError(err) {
			if (err instanceof ClientResponseError) {
				if (err.error === 'AuthFactorTokenRequired') {
					setLoginOtp('');
					setIsLoginTotpRequired(true);
					return;
				}
				if (err.error === 'AuthenticationRequired') {
					setLoginError(`Invalid identifier or password`);
					return;
				}
				if (err.description?.includes('Token is invalid')) {
					setLoginError(`Invalid one-time confirmation code`);
					setIsLoginTotpRequired(true);
					return;
				}
			}
			if (err instanceof InsufficientLoginError) {
				setLoginError(err.message);
				return;
			}
			console.error(err);
			setLoginError(`${err}`);
		},
	});

	const isConnected = () => destination() !== null;
	const isAuthenticated = () => destination()?.manager != null;
	const canCreateAccount = () => source()?.manager != null;

	return (
		<Accordion title="Destination Account">
			<Subsection title="Connect to PDS">
				<Show when={!isConnected()}>
					<form
						onSubmit={(ev) => {
							ev.preventDefault();
							connectMutation.mutate({ pdsUrl: pdsUrl() });
						}}
						class="flex flex-col gap-3"
					>
						<TextInput
							label="PDS URL"
							type="url"
							placeholder="https://pds.example.com"
							value={pdsUrl()}
							required
							onChange={(text, event) => {
								setPdsUrl(text);
								const input = event.currentTarget;
								if (text !== '' && !isServiceUrlString(text)) {
									input.setCustomValidity('Must be a valid URL');
								} else {
									input.setCustomValidity('');
								}
							}}
						/>

						<Show when={connectError()}>
							<p class="text-sm text-red-600">{connectError()}</p>
						</Show>

						<div>
							<Button type="submit" disabled={connectMutation.isPending}>
								{connectMutation.isPending ? 'Connecting...' : 'Connect'}
							</Button>
						</div>
					</form>
				</Show>

				<Show when={isConnected()}>
					<div class="flex flex-col gap-2 text-sm">
						<p>
							<span class="text-gray-500">URL:</span>{' '}
							<span class="font-mono">{destination()!.pdsUrl}</span>
						</p>
						<p>
							<span class="text-gray-500">Service DID:</span>{' '}
							<span class="font-mono">{destination()!.serviceDid}</span>
						</p>
						<div class="mt-1">
							<button
								type="button"
								onClick={() => setDestination(null)}
								class="text-sm text-purple-800 hover:underline"
							>
								Change PDS
							</button>
						</div>
					</div>
				</Show>
			</Subsection>

			<Show when={isConnected() && !isAuthenticated()}>
				<Subsection title="Create new account">
					<Show when={!canCreateAccount()}>
						<p class="text-sm text-gray-600">
							You need to authenticate to your source account first to create an account on the
							destination PDS.
						</p>
					</Show>

					<Show when={canCreateAccount()}>
						<form
							onSubmit={(ev) => {
								ev.preventDefault();
								const src = source()!;
								const dest = destination()!;
								createAccountMutation.mutate({
									sourceDid: src.did,
									sourceManager: src.manager!,
									destPdsUrl: dest.pdsUrl,
									destServiceDid: dest.serviceDid,
									handle: newHandle() as Handle,
									email: newEmail(),
									password: newPassword(),
									inviteCode: inviteCode(),
								});
							}}
							class="flex flex-col gap-3"
						>
							<TextInput
								label="Handle"
								placeholder="alice.pds.example.com"
								value={newHandle()}
								required
								onChange={setNewHandle}
							/>

							<TextInput
								label="Email"
								type="email"
								placeholder="alice@example.com"
								value={newEmail()}
								required
								onChange={setNewEmail}
							/>

							<TextInput
								label="Password"
								type="password"
								value={newPassword()}
								required
								onChange={setNewPassword}
							/>

							<TextInput
								label="Invite code (if required)"
								placeholder="pds-example-com-xxxxx"
								value={inviteCode()}
								onChange={setInviteCode}
							/>

							<Show when={createError()}>
								<p class="text-sm text-red-600">{createError()}</p>
							</Show>

							<div>
								<Button type="submit" disabled={createAccountMutation.isPending}>
									{createAccountMutation.isPending ? 'Creating...' : 'Create account'}
								</Button>
							</div>
						</form>
					</Show>
				</Subsection>

				<Subsection title="Or login to existing account">
					<p class="mb-2 text-sm text-gray-600">
						If you already have a deactivated account on the destination PDS.
					</p>

					<Show when={!source()}>
						<p class="text-sm text-gray-600">
							Resolve your source account first so we know which DID to use.
						</p>
					</Show>

					<Show when={source()}>
						<form
							onSubmit={(ev) => {
								ev.preventDefault();
								const src = source()!;
								const dest = destination()!;
								loginMutation.mutate({
									pdsUrl: dest.pdsUrl,
									did: src.did,
									password: loginPassword(),
									otp: loginOtp(),
								});
							}}
							class="flex flex-col gap-3"
						>
							<TextInput
								label="Password"
								type="password"
								value={loginPassword()}
								required
								onChange={setLoginPassword}
							/>

							<Show when={isLoginTotpRequired()}>
								<TextInput
									label="One-time confirmation code"
									blurb="A code has been sent to your email address."
									type="text"
									autocomplete="one-time-code"
									pattern={TOTP_RE.source}
									placeholder="AAAAA-BBBBB"
									value={loginOtp()}
									required
									onChange={setLoginOtp}
									monospace
								/>
							</Show>

							<Show when={loginError()}>
								<p class="text-sm text-red-600">{loginError()}</p>
							</Show>

							<div>
								<Button type="submit" disabled={loginMutation.isPending}>
									{loginMutation.isPending ? 'Signing in...' : 'Sign in'}
								</Button>
							</div>
						</form>
					</Show>
				</Subsection>
			</Show>

			<Show when={isAuthenticated()}>
				<Subsection title="Account status">
					<div class="flex items-center gap-2">
						<StatusBadge variant="success">Signed in</StatusBadge>
						<button
							type="button"
							onClick={() => setDestination({ ...destination()!, manager: null })}
							class="text-sm text-purple-800 hover:underline"
						>
							Sign out
						</button>
					</div>
				</Subsection>
			</Show>
		</Accordion>
	);
};

export default DestinationAccountSection;
