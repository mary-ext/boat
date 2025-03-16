import { createMemo, createSignal, Show } from 'solid-js';

import {
	type CompatibleOperation,
	type DisputeCandidate,
	getDisputeCandidates,
	type IndexedEntryWithSigner,
	normalizeOp,
} from '@atcute/did-plc';
import type { Did } from '@atcute/identity';

import Button from '~/components/inputs/button';
import SelectInput from '~/components/inputs/select-input';
import { Stage, StageActions, StageErrorView, WizardStepProps } from '~/components/wizard';

import { PlcApplicatorConstraints } from '../page';
import RadioInput from '~/components/inputs/radio-input';

const Step3_OperationSelect = ({
	data,
	isActive,
	onPrevious,
	onNext,
}: WizardStepProps<PlcApplicatorConstraints, 'Step3_OperationSelect'>) => {
	const [error, setError] = createSignal<string>();

	const [type, setType] = createSignal<'append' | 'dispute'>();
	const [cid, setCid] = createSignal<string>();

	const canAppend = createMemo(() => {
		const signing = data.method;

		const lastOp = data.info.logs.at(-1) as IndexedEntryWithSigner<CompatibleOperation>;
		const { rotationKeys } = normalizeOp(lastOp.operation);

		switch (signing.type) {
			case 'pds': {
				const key = signing.recommendedDidDoc.rotationKeys?.at(-1) as Did<'key'> | undefined;
				if (!key) {
					return false;
				}

				return rotationKeys.includes(key);
			}
			case 'private_key': {
				return rotationKeys.includes(signing.didPublicKey);
			}
		}
	});

	const disputes = createMemo((): DisputeCandidate[] => {
		const signing = data.method;

		switch (signing.type) {
			case 'pds': {
				// signPlcOperation always grabs the last operation, so we can't make
				// any dispute attempts.
				return [];
			}
			case 'private_key': {
				return getDisputeCandidates(data.info.logs, signing.didPublicKey);
			}
		}
	});

	return (
		<Stage
			title="What do you want to do?"
			onSubmit={() => {
				setError();

				const $type = type();
				const $cid = cid();

				switch ($type) {
					case 'append': {
						const lastOp = data.info.logs.at(-1) as IndexedEntryWithSigner<CompatibleOperation>;

						onNext('Step4_PayloadInput', {
							info: data.info,
							method: data.method,
							base: lastOp,
						});

						break;
					}
					case 'dispute': {
						const entry = disputes().find((entry) => entry.base.cid === $cid);
						if (!entry) {
							setError(`Can't find dispute entry for ${$cid}`);
							return;
						}

						onNext('Step4_PayloadInput', {
							info: data.info,
							method: data.method,
							base: entry.base,
						});

						break;
					}
				}
			}}
		>
			<RadioInput
				label="I want to..."
				required
				value={type()}
				options={[
					{
						value: 'append',
						label: `Append an operation`,
						disabled: !canAppend(),
					},
					{
						value: 'dispute',
						label: `Dispute an existing operation`,
						disabled: disputes().length === 0,
					},
				]}
				onChange={setType}
			/>

			<Show when={type() === 'dispute'}>
				<SelectInput
					label="Dispute operation"
					blurb="Select an operation to dispute."
					required
					value={cid()}
					autofocus={isActive()}
					options={[
						{ value: '', label: `Select an operation...` },
						...disputes().map((entry) => ({
							value: entry.base.cid,
							label: `${entry.base.cid} ➔ ${entry.disputed.cid} (by ${entry.disputed.signedBy})`,
						})),
					]}
					onChange={setCid}
				/>
			</Show>

			<Show when={!canAppend() && disputes().length === 0}>
				<p class="whitespace-pre-wrap text-[0.8125rem] font-medium leading-5 text-red-800">
					This rotation key can't be used.
				</p>
			</Show>

			<StageErrorView error={error()} />

			<StageActions hidden={!isActive()}>
				<StageActions.Divider />
				<Button variant="secondary" onClick={onPrevious}>
					Previous
				</Button>
				<Button type="submit" disabled={type() === undefined}>
					Next
				</Button>
			</StageActions>
		</Stage>
	);
};

export default Step3_OperationSelect;
