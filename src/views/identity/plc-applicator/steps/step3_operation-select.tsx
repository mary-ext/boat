import { createMemo, createSignal } from 'solid-js';

import Button from '~/components/inputs/button';
import SelectInput from '~/components/inputs/select-input';
import { Stage, StageActions, StageErrorView, WizardStepProps } from '~/components/wizard';

import { PlcApplicatorConstraints } from '../page';
import { getCurrentSignersFromEntry } from '../plc-utils';

const Step3_OperationSelect = ({
	data,
	isActive,
	onPrevious,
	onNext,
}: WizardStepProps<PlcApplicatorConstraints, 'Step3_OperationSelect'>) => {
	const [error, setError] = createSignal<string>();
	const [selectedCid, setSelectedCid] = createSignal<string>();

	const options = createMemo(() => {
		const signingMethod = data.method;
		const logs = data.info.logs;

		let ownKey: string | undefined;
		if (signingMethod.type === 'pds') {
			ownKey = signingMethod.recommendedDidDoc.rotationKeys?.at(-1);
		} else if (signingMethod.type === 'private_key') {
			ownKey = signingMethod.didPublicKey;
		}

		if (ownKey === undefined) {
			return [];
		}

		const length = logs.length;
		const items = logs.map((entry, idx) => {
			const signers = getCurrentSignersFromEntry(entry);
			const last = idx === length - 1;

			let enabled = signers.includes(ownKey!);

			// If we're showing older operations for forking/nullification,
			// check to see that our key has priority over the signer.
			if (enabled && !last) {
				if (signingMethod.type === 'pds') {
					// `signPlcOperation` will always grab the last op
					enabled = false;
				} else {
					const holderKey = logs[idx + 1].signedBy;

					const holderPriority = signers.indexOf(holderKey);
					const ownPriority = signers.indexOf(ownKey);

					enabled = ownPriority < holderPriority;
				}
			}

			return {
				value: entry.cid,
				label: `${entry.createdAt} (by ${entry.signedBy})`,
				disabled: !enabled,
			};
		});

		return items.reverse();
	});

	return (
		<Stage
			title="Select which operation to use as foundation"
			onSubmit={() => {
				setError();

				const cid = selectedCid();
				const entry = data.info.logs.find((entry) => entry.cid === cid);

				if (!entry) {
					setError(`Can't find CID ${cid}`);
					return;
				}

				const operation = entry.operation;
				if (operation.type !== 'plc_operation' && operation.type === 'create') {
					setError(`Expected operation to be of type "plc_operation" or "create"`);
					return;
				}

				onNext('Step4_PayloadInput', {
					info: data.info,
					method: data.method,
					base: entry,
				});
			}}
		>
			<SelectInput
				label="Base operation"
				blurb="Some operations can't be used as a base if the rotation key does not have the privilege for nullification, or if it is not listed."
				required
				value={selectedCid()}
				autofocus={isActive()}
				options={[{ value: '', label: `Select an operation...` }, ...options()]}
				onChange={setSelectedCid}
			/>

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

export default Step3_OperationSelect;
