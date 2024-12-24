import { createSignal } from 'solid-js';

import * as CBOR from '@atcute/cbor';
import * as uint8arrays from 'uint8arrays';

import { PlcUpdateOp } from '~/api/types/plc';

import { generateConfirmationCode } from '~/lib/utils/confirmation-code';
import { createMutation } from '~/lib/utils/mutation';

import Button from '~/components/inputs/button';
import TextInput from '~/components/inputs/text-input';
import { Stage, StageActions, StageErrorView, WizardStepProps } from '~/components/wizard';

import { PlcApplicatorConstraints } from '../page';

const Step5_PrivateKeyConfirmation = ({
	data,
	isActive,
	onPrevious,
	onNext,
}: WizardStepProps<PlcApplicatorConstraints, 'Step5_PrivateKeyConfirmation'>) => {
	const [error, setError] = createSignal<string>();

	const code = generateConfirmationCode();

	const mutation = createMutation({
		async mutationFn() {
			const keypair = data.method.keypair;
			const payload = data.payload;
			const prev = data.base;

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

			await pushPlcOperation(data.info.didDoc.id, signedOperation);
		},
		onMutate() {
			setError();
		},
		onSuccess() {
			onNext('Step6_Finished', {});
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
			title="One more step"
			disabled={mutation.isPending}
			onSubmit={() => {
				mutation.mutate();
			}}
		>
			<p class="text-pretty">
				To continue with this submission, type in the following code{' '}
				<code class="whitespace-nowrap font-bold">{code}</code> to the confirmation box below.
			</p>

			<TextInput
				label="Confirmation code"
				type="text"
				autocomplete="one-time-code"
				autocorrect="off"
				required
				pattern={code}
				placeholder="AAAAA-BBBBB"
				autofocus={isActive()}
				monospace
			/>

			<div>
				<p class="text-pretty">
					Review your payload carefully, and click <i>Submit</i> when ready.
				</p>

				<p class="mt-3 text-pretty font-medium text-red-800">
					Caution: This action carries significant risk which can possibly render your did:plc identity
					unusable. Proceed at your own risk, we assume no liability for any consequences.
				</p>
			</div>

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

export default Step5_PrivateKeyConfirmation;

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
