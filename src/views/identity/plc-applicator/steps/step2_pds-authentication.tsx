import { createSignal, Match, Show, Switch } from 'solid-js';

import { AtpAccessJwt, CredentialManager, XRPC, XRPCError } from '@atcute/client';
import { decodeJwt } from '@atcute/client/utils/jwt';

import { getPdsEndpoint } from '~/api/types/did-doc';
import { TOTP_RE, formatTotpCode } from '~/api/utils/auth';

import { createMutation } from '~/lib/utils/mutation';

import Button from '~/components/inputs/button';
import TextInput from '~/components/inputs/text-input';
import { Stage, StageActions, StageErrorView, WizardStepProps } from '~/components/wizard';

import { PlcApplicatorConstraints } from '../page';

class InsufficientLoginError extends Error {}

const Step2_PdsAuthentication = ({
	data,
	isActive,
	onPrevious,
	onNext,
}: WizardStepProps<PlcApplicatorConstraints, 'Step2_PdsAuthentication'>) => {
	const [error, setError] = createSignal<string>();
	const [isTotpRequired, setIsTotpRequired] = createSignal(false);

	const [manager, setManager] = createSignal<CredentialManager>();

	const [serviceUrl, setServiceUrl] = createSignal(getPdsEndpoint(data.info.didDoc) ?? '');
	const [password, setPassword] = createSignal('');
	const [otp, setOtp] = createSignal('');

	const loginMutation = createMutation({
		async mutationFn({ service, password, otp }: { service: string; password: string; otp: string }) {
			const manager = new CredentialManager({ service });
			const _session = await manager.login({
				identifier: data.info.didDoc.id,
				password: password,
				code: formatTotpCode(otp),
			});

			const decoded = decodeJwt(_session.accessJwt) as AtpAccessJwt;
			if (decoded.scope !== 'com.atproto.access') {
				throw new InsufficientLoginError(`You need to be signed in with a main password`);
			}

			return manager;
		},
		onMutate() {
			setError();
		},
		onSuccess(manager) {
			dispatchMutation.mutate({ manager });

			setManager(manager);

			setOtp('');
			setPassword('');
			setIsTotpRequired(false);
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

	const dispatchMutation = createMutation({
		async mutationFn({ manager }: { manager: CredentialManager }) {
			const rpc = new XRPC({ handler: manager });
			const { data: recommendedDidDoc } = await rpc.get(
				'com.atproto.identity.getRecommendedDidCredentials',
				{},
			);

			return { recommendedDidDoc };
		},
		onMutate() {
			setError();
		},
		onSuccess({ recommendedDidDoc }, { manager }) {
			onNext('Step3_OperationSelect', {
				info: data.info,
				method: {
					type: 'pds',
					manager,
					recommendedDidDoc,
				},
			});
		},
		onError(error) {
			let message: string | undefined;

			if (message !== undefined) {
				setError(message);
			} else {
				console.error(error);
				setError(`Something went wrong: ${error}`);
			}
		},
	});

	return (
		<Stage
			title="Sign in to your PDS"
			disabled={loginMutation.isPending || dispatchMutation.isPending}
			onSubmit={() => {
				const $manager = manager();

				if ($manager) {
					dispatchMutation.mutate({
						manager: $manager,
					});
				} else {
					loginMutation.mutate({
						service: serviceUrl(),
						password: password(),
						otp: otp(),
					});
				}
			}}
		>
			<Switch>
				<Match when={manager()} keyed>
					{(manager) => (
						<p class="break-words">
							Signed in via <b>{/* @once */ manager.dispatchUrl}</b>.{' '}
							<button
								type="button"
								onClick={() => setManager(undefined)}
								hidden={!isActive()}
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
						placeholder="https://pds.example.com"
						value={serviceUrl()}
						required
						onChange={setServiceUrl}
					/>

					<TextInput
						label="Main password"
						blurb="This app runs locally on your browser, your credentials stays entirely within your device."
						type="password"
						value={password()}
						required
						autofocus={isActive()}
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

			<StageActions hidden={!isActive()}>
				<StageActions.Divider />

				<Button variant="secondary" onClick={onPrevious}>
					Previous
				</Button>
				<Button type="submit">Next</Button>
			</StageActions>
		</Stage>
	);
};

export default Step2_PdsAuthentication;
