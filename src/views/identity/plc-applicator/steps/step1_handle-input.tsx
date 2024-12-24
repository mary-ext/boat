import { createSignal } from 'solid-js';

import { At } from '@atcute/client/lexicons';

import { getDidDocument } from '~/api/queries/did-doc';
import { resolveHandleViaAppView } from '~/api/queries/handle';
import { getPlcAuditLogs } from '~/api/queries/plc';
import { DID_OR_HANDLE_RE, DID_PLC_RE, isDid } from '~/api/utils/strings';

import { createMutation } from '~/lib/utils/mutation';

import Button from '~/components/inputs/button';
import RadioInput from '~/components/inputs/radio-input';
import TextInput from '~/components/inputs/text-input';
import { Stage, StageActions, StageErrorView, WizardStepProps } from '~/components/wizard';

import { type PlcInformation, PlcApplicatorConstraints } from '../page';
import { getPlcKeying } from '../plc-utils';

type Method = 'pds' | 'key';

interface MutationVariables {
	identifier: string;
	method: Method;
}

class DidIsNotPlcError extends Error {}

const Step1_HandleInput = ({
	isActive,
	onNext,
}: WizardStepProps<PlcApplicatorConstraints, 'Step1_HandleInput'>) => {
	const [error, setError] = createSignal<string>();

	const [identifier, setIdentifier] = createSignal('');
	const [method, setMethod] = createSignal<Method>('pds');

	const mutation = createMutation({
		async mutationFn({ identifier }: MutationVariables): Promise<PlcInformation> {
			let did: At.DID;
			if (isDid(identifier)) {
				did = identifier;
			} else {
				did = await resolveHandleViaAppView({ handle: identifier });
			}

			if (!DID_PLC_RE.test(did)) {
				throw new DidIsNotPlcError(`"${did}" is not did:plc`);
			}

			const [didDoc, logs] = await Promise.all([getDidDocument({ did }), getPlcAuditLogs({ did })]);

			return {
				didDoc,
				logs: await getPlcKeying(logs),
			};
		},
		onMutate() {
			setError();
		},
		onSuccess(info, { method }) {
			if (method === 'pds') {
				onNext('Step2_PdsAuthentication', { info });
			} else {
				onNext('Step2_PrivateKeyInput', { info });
			}
		},
		onError(error) {
			let message: string | undefined;

			if (error instanceof DidIsNotPlcError) {
				message = error.message;
			}

			if (message !== undefined) {
				setError(message);
			} else {
				setError(`Something went wrong: ${error}`);
			}
		},
	});

	return (
		<Stage
			title="Enter the did:plc you want to edit"
			disabled={mutation.isPending}
			onSubmit={() => {
				mutation.mutate({
					identifier: identifier(),
					method: method(),
				});
			}}
		>
			<TextInput
				label="Handle or DID identifier"
				placeholder="paul.bsky.social"
				value={identifier()}
				required
				pattern={/* @once */ DID_OR_HANDLE_RE.source}
				autofocus={isActive()}
				onChange={setIdentifier}
			/>

			<RadioInput
				label="I will be using..."
				value={method()}
				required
				options={[
					{ value: 'pds', label: `my PDS' rotation keys (requires sign in)` },
					{ value: 'key', label: `my own rotation keys` },
				]}
				onChange={setMethod}
			/>

			<StageErrorView error={error()} />

			<StageActions hidden={!isActive()}>
				<StageActions.Divider />
				<Button type="submit">Next</Button>
			</StageActions>
		</Stage>
	);
};

export default Step1_HandleInput;
