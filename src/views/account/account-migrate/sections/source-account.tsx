import { createSignal, Show } from 'solid-js';

import { type AtpAccessJwt, ClientResponseError, CredentialManager } from '@atcute/client';
import { getPdsEndpoint, isAtprotoDid } from '@atcute/identity';
import { isHandle, type AtprotoDid } from '@atcute/lexicons/syntax';

import { getDidDocument } from '~/api/queries/did-doc';
import { resolveHandleViaAppView } from '~/api/queries/handle';
import { formatTotpCode, TOTP_RE } from '~/api/utils/auth';
import { decodeJwt } from '~/api/utils/jwt';

import { createMutation } from '~/lib/utils/mutation';

import { Accordion, StatusBadge, Subsection } from '~/components/accordion';
import Button from '~/components/inputs/button';
import TextInput from '~/components/inputs/text-input';

import { useMigration } from '../context';

interface SourceAccountSectionProps {
	onStarted?: () => void;
}

class InsufficientLoginError extends Error {}

const SourceAccountSection = (props: SourceAccountSectionProps) => {
	const { source, setSource } = useMigration();

	// Resolve state
	const [identifier, setIdentifier] = createSignal('');
	const [resolveError, setResolveError] = createSignal<string>();

	// Auth state
	const [password, setPassword] = createSignal('');
	const [otp, setOtp] = createSignal('');
	const [isTotpRequired, setIsTotpRequired] = createSignal(false);
	const [authError, setAuthError] = createSignal<string>();

	const resolveMutation = createMutation({
		async mutationFn({ identifier }: { identifier: string }) {
			let did: AtprotoDid;
			if (isAtprotoDid(identifier)) {
				did = identifier;
			} else if (isHandle(identifier)) {
				did = await resolveHandleViaAppView({ handle: identifier });
			} else {
				throw new Error(`${identifier} is not a valid DID or handle`);
			}

			const didDoc = await getDidDocument({ did });
			const pdsUrl = getPdsEndpoint(didDoc);

			if (!pdsUrl) {
				throw new Error(`No PDS endpoint found in DID document`);
			}

			return { did, didDoc, pdsUrl };
		},
		onMutate() {
			setResolveError();
		},
		onSuccess({ did, didDoc, pdsUrl }) {
			setSource({ did, didDoc, pdsUrl, manager: null });
			props.onStarted?.();
		},
		onError(err) {
			if (err instanceof ClientResponseError) {
				if (err.error === 'InvalidRequest' && err.description?.includes('resolve handle')) {
					setResolveError(`Can't resolve handle, is it typed correctly?`);
					return;
				}
			}
			console.error(err);
			setResolveError(`${err}`);
		},
	});

	const authMutation = createMutation({
		async mutationFn({ pdsUrl, did, password, otp }: { pdsUrl: string; did: string; password: string; otp: string }) {
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
			setAuthError();
		},
		onSuccess(manager) {
			setSource({ ...source()!, manager });
			setPassword('');
			setOtp('');
			setIsTotpRequired(false);
		},
		onError(err) {
			if (err instanceof ClientResponseError) {
				if (err.error === 'AuthFactorTokenRequired') {
					setOtp('');
					setIsTotpRequired(true);
					return;
				}
				if (err.error === 'AuthenticationRequired') {
					setAuthError(`Invalid identifier or password`);
					return;
				}
				if (err.error === 'AccountTakedown') {
					setAuthError(`Account has been taken down`);
					return;
				}
				if (err.description?.includes('Token is invalid')) {
					setAuthError(`Invalid one-time confirmation code`);
					setIsTotpRequired(true);
					return;
				}
			}
			if (err instanceof InsufficientLoginError) {
				setAuthError(err.message);
				return;
			}
			console.error(err);
			setAuthError(`${err}`);
		},
	});

	const isResolved = () => source() !== null;
	const isAuthenticated = () => source()?.manager != null;

	return (
		<Accordion title="Source Account" defaultOpen>
			<Subsection title="Resolve identity">
				<Show when={!isResolved()}>
					<form
						onSubmit={(ev) => {
							ev.preventDefault();
							resolveMutation.mutate({ identifier: identifier() });
						}}
						class="flex flex-col gap-3"
					>
						<TextInput
							label="Handle or DID"
							placeholder="alice.bsky.social"
							value={identifier()}
							required
							autofocus
							onChange={setIdentifier}
						/>

						<Show when={resolveError()}>
							<p class="text-sm text-red-600">{resolveError()}</p>
						</Show>

						<div>
							<Button type="submit" disabled={resolveMutation.isPending}>
								{resolveMutation.isPending ? 'Resolving...' : 'Resolve'}
							</Button>
						</div>
					</form>
				</Show>

				<Show when={isResolved()}>
					<div class="flex flex-col gap-2 text-sm">
						<p>
							<span class="text-gray-500">DID:</span>{' '}
							<span class="font-mono">{source()!.did}</span>
						</p>
						<p>
							<span class="text-gray-500">PDS:</span>{' '}
							<span class="font-mono">{source()!.pdsUrl}</span>
						</p>
						<div class="mt-1">
							<button
								type="button"
								onClick={() => setSource(null)}
								class="text-sm text-purple-800 hover:underline"
							>
								Change account
							</button>
						</div>
					</div>
				</Show>
			</Subsection>

			<Show when={isResolved()}>
				<Subsection title="Authenticate">
					<p class="text-sm text-gray-600">
						Authentication is required for some operations like exporting preferences or signing PLC operations.
					</p>

					<Show when={!isAuthenticated()}>
						<form
							onSubmit={(ev) => {
								ev.preventDefault();
								const src = source()!;
								authMutation.mutate({
									pdsUrl: src.pdsUrl,
									did: src.did,
									password: password(),
									otp: otp(),
								});
							}}
							class="flex flex-col gap-3"
						>
							<TextInput
								label="Main password"
								blurb="Your credentials stay entirely within your browser."
								type="password"
								value={password()}
								required
								onChange={setPassword}
							/>

							<Show when={isTotpRequired()}>
								<TextInput
									label="One-time confirmation code"
									blurb="A code has been sent to your email address."
									type="text"
									autocomplete="one-time-code"
									pattern={TOTP_RE.source}
									placeholder="AAAAA-BBBBB"
									value={otp()}
									required
									onChange={setOtp}
									monospace
								/>
							</Show>

							<Show when={authError()}>
								<p class="text-sm text-red-600">{authError()}</p>
							</Show>

							<div>
								<Button type="submit" disabled={authMutation.isPending}>
									{authMutation.isPending ? 'Signing in...' : 'Sign in'}
								</Button>
							</div>
						</form>
					</Show>

					<Show when={isAuthenticated()}>
						<div class="flex items-center gap-2">
							<StatusBadge variant="success">Signed in</StatusBadge>
							<button
								type="button"
								onClick={() => setSource({ ...source()!, manager: null })}
								class="text-sm text-purple-800 hover:underline"
							>
								Sign out
							</button>
						</div>
					</Show>
				</Subsection>
			</Show>
		</Accordion>
	);
};

export default SourceAccountSection;
