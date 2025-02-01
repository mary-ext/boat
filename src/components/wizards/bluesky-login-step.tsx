import { batch, createSignal, Match, Show, Switch } from 'solid-js';

import { CredentialManager, XRPCError } from '@atcute/client';
import { At } from '@atcute/client/lexicons';

import { getDidDocument } from '~/api/queries/did-doc';
import { resolveHandleViaAppView } from '~/api/queries/handle';
import { DidDocument, getPdsEndpoint } from '~/api/types/did-doc';
import { formatTotpCode, TOTP_RE } from '~/api/utils/auth';
import { isDid } from '~/api/utils/strings';

import { createMutation } from '~/lib/utils/mutation';

import Button from '../inputs/button';
import TextInput from '../inputs/text-input';
import { Stage, StageActions, StageErrorView } from '../wizard';

class InsufficientLoginError extends Error {}

export interface BlueskyLoginSectionProps {
	manager: CredentialManager | undefined;
	didDocument: DidDocument;
	isActive: boolean;
	onAuthorize: (manager: CredentialManager) => void;
	onUnauthorize: () => void;
	onPrevious: () => void;
}

const BlueskyLoginStep = (props: BlueskyLoginSectionProps) => {
	const onAuthorize = props.onAuthorize;
	const onUnauthorize = props.onUnauthorize;
	const onPrevious = props.onPrevious;

	const [error, setError] = createSignal<string>();
	const [isTotpRequired, setIsTotpRequired] = createSignal(false);

	const [serviceUrl, setServiceUrl] = createSignal('');
	const [password, setPassword] = createSignal('');
	const [otp, setOtp] = createSignal('');

	const mutation = createMutation({
		async mutationFn({
			service,
			identifier,
			password,
			otp,
		}: {
			service: string | undefined;
			identifier: string;
			password: string;
			otp: string;
		}) {
			identifier = identifier.replace(/^\s*@?|\s+$/g, '');
			service = service?.trim() || undefined;

			if (service === undefined) {
				let did: At.DID;
				if (!isDid(identifier)) {
					did = await resolveHandleViaAppView({ handle: identifier });
				} else {
					did = identifier;
				}

				const didDoc = await getDidDocument({ did });
				const pdsEndpoint = getPdsEndpoint(didDoc);

				if (pdsEndpoint === undefined) {
					throw new InsufficientLoginError(`Identity does not have a PDS configured`);
				}

				setServiceUrl((service = pdsEndpoint));
			}

			const manager = new CredentialManager({ service });
			await manager.login({ identifier, password, code: formatTotpCode(otp) });

			return manager;
		},
		onMutate() {
			setError();
		},
		onSuccess(manager) {
			batch(() => {
				onAuthorize(manager);

				setOtp('');
				setPassword('');
				setIsTotpRequired(false);
			});
		},
		onError(error) {
			let message: string | undefined;

			if (error instanceof XRPCError) {
				if (error.kind === 'AuthFactorTokenRequired') {
					setOtp('');
					setIsTotpRequired(true);
					return;
				}

				if (error.kind === 'AuthenticationRequired') {
					message = `Invalid identifier or password`;
				} else if (error.kind === 'AccountTakedown') {
					message = `Account has been taken down`;
				} else if (error.message.includes('Token is invalid')) {
					message = `Invalid one-time confirmation code`;
					setIsTotpRequired(true);
				}
			} else if (error instanceof InsufficientLoginError) {
				message = error.message;
			}

			if (message !== undefined) {
				setError(message);
			} else {
				console.error(error);
				setError(`Something went wrong: ${error}`);
			}
		},
	});

	{
		const pdsEndpoint = getPdsEndpoint(props.didDocument);
		if (pdsEndpoint) {
			setServiceUrl(pdsEndpoint);
		}
	}

	return (
		<Stage
			title="Sign in to your PDS"
			disabled={mutation.isPending}
			onSubmit={() => {
				const manager = props.manager;

				if (manager) {
					onAuthorize(manager);
				} else {
					mutation.mutate({
						service: serviceUrl(),
						identifier: props.didDocument.id,
						password: password(),
						otp: otp(),
					});
				}
			}}
		>
			<Switch>
				<Match when={props.manager}>
					{(manager) => (
						<p class="break-words">
							Signed in via <b>{manager().dispatchUrl}</b>.{' '}
							<button
								type="button"
								onClick={onUnauthorize}
								hidden={!props.isActive}
								class="text-purple-800 hover:underline disabled:pointer-events-none"
							>
								Sign out?
							</button>
						</p>
					)}
				</Match>

				<Match when>
					<TextInput
						label="PDS service URL"
						type="url"
						placeholder="Leave blank if unsure, e.g. https://pds.example.com"
						value={serviceUrl()}
						onChange={setServiceUrl}
					/>

					<TextInput
						label="Password"
						blurb="Generate an app password for use with this app. This app runs locally on your browser, your credentials stays entirely within your device."
						type="password"
						value={password()}
						required
						autofocus={props.isActive}
						onChange={setPassword}
					/>

					<Show when={isTotpRequired()}>
						<TextInput
							label="One-time confirmation code"
							blurb="A code has been sent to your email address, check your inbox."
							type="text"
							autocomplete="one-time-code"
							autocorrect="off"
							pattern={/* @once */ TOTP_RE.source}
							placeholder="AAAAA-BBBBB"
							value={otp()}
							required
							onChange={setOtp}
							monospace
						/>
					</Show>
				</Match>
			</Switch>

			<StageErrorView error={error()} />

			<StageActions hidden={!props.isActive}>
				<StageActions.Divider />

				<Button variant="secondary" onClick={onPrevious}>
					Previous
				</Button>
				<Button type="submit">Next</Button>
			</StageActions>
		</Stage>
	);
};

export default BlueskyLoginStep;
