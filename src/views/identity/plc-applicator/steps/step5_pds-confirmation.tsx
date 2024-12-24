import { createSignal } from 'solid-js';

import { XRPC, XRPCError } from '@atcute/client';

import { formatTotpCode, TOTP_RE } from '~/api/utils/auth';

import { createMutation } from '~/lib/utils/mutation';

import CheckIcon from '~/components/ic-icons/baseline-check';
import Button from '~/components/inputs/button';
import TextInput from '~/components/inputs/text-input';
import { Stage, StageActions, StageErrorView, WizardStepProps } from '~/components/wizard';

import { PlcApplicatorConstraints } from '../page';

export const Step5_PdsConfirmation = ({
	data,
	isActive,
	onPrevious,
	onNext,
}: WizardStepProps<PlcApplicatorConstraints, 'Step5_PdsConfirmation'>) => {
	const [requestError, setRequestError] = createSignal<string>();
	const [applyError, setApplyError] = createSignal<string>();

	const [otp, setOtp] = createSignal('');

	const requestMutation = createMutation({
		async mutationFn() {
			const manager = data.method.manager;
			const rpc = new XRPC({ handler: manager });

			await rpc.call('com.atproto.identity.requestPlcOperationSignature', {});
		},
		onMutate() {
			setRequestError();
		},
		onError(error) {
			let message: string | undefined;

			if (message !== undefined) {
				setRequestError(message);
			} else {
				console.error(error);
				setRequestError(`Something went wrong: ${error}`);
			}
		},
	});

	const applyMutation = createMutation({
		async mutationFn({ code }: { code: string }) {
			const manager = data.method.manager;
			const rpc = new XRPC({ handler: manager });

			const payload = data.payload;

			const { data: signage } = await rpc.call('com.atproto.identity.signPlcOperation', {
				data: {
					token: formatTotpCode(code),
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
		},
		onMutate() {
			setApplyError();
		},
		onSuccess() {
			onNext('Step6_Finished', {});
		},
		onError(error) {
			let message: string | undefined;

			if (error instanceof XRPCError) {
				if (error.kind === 'InvalidToken' || error.kind === 'ExpiredToken') {
					message = `Confirmation code has expired`;
				}
			}

			if (message !== undefined) {
				setApplyError(message);
			} else {
				console.error(error);
				setApplyError(`Something went wrong: ${error}`);
			}
		},
	});

	return (
		<Stage
			title="One more step"
			onSubmit={() => {
				applyMutation.mutate({
					code: otp(),
				});
			}}
		>
			<p class="text-pretty">
				To continue with this submission, you will need to request a confirmation code from your PDS. This
				code will be sent to your account's email address.
			</p>

			<TextInput
				label="One-time confirmation code"
				type="text"
				autocomplete="one-time-code"
				autocorrect="off"
				pattern={/* @once */ TOTP_RE.source}
				placeholder="AAAAA-BBBBB"
				value={otp()}
				required
				autofocus={isActive()}
				onChange={setOtp}
				monospace
			/>

			<div hidden={!isActive()} class="-mt-4 flex flex-wrap gap-4">
				<button
					disabled={requestMutation.isPending}
					type="button"
					class={
						`flex items-center gap-1 text-[0.8125rem] leading-5 text-purple-800 hover:underline disabled:pointer-events-none` +
						(requestMutation.isPending ? `disabled:opacity-50` : ``)
					}
					onClick={() => requestMutation.mutate()}
				>
					<span>Request confirmation code</span>
					{requestMutation.isSuccess && <CheckIcon class="text-lg text-green-600" />}
				</button>
			</div>

			<StageErrorView error={requestError()} />

			<div>
				<p class="text-pretty">
					Review your payload carefully, and click <i>Submit</i> when ready.
				</p>

				<p class="mt-3 text-pretty font-medium text-red-800">
					Caution: This action carries significant risk which can possibly render your did:plc identity
					unusable. Proceed at your own risk, we assume no liability for any consequences.
				</p>
			</div>

			<StageErrorView error={applyError()} />

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

export default Step5_PdsConfirmation;
