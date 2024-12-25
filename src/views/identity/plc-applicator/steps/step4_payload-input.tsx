import { createSignal } from 'solid-js';

import { updatePayload } from '~/api/types/plc';

import Button from '~/components/inputs/button';
import MultilineInput from '~/components/inputs/multiline-input';
import { Stage, StageActions, StageErrorView, WizardStepProps } from '~/components/wizard';

import { PlcApplicatorConstraints } from '../page';
import { getPlcPayload } from '../plc-utils';

export const Step4_PayloadInput = ({
	data,
	isActive,
	onPrevious,
	onNext,
}: WizardStepProps<PlcApplicatorConstraints, 'Step4_PayloadInput'>) => {
	const [error, setError] = createSignal<string>();

	const originalSource = JSON.stringify(getPlcPayload(data.base), null, 2);
	const [source, setSource] = createSignal(originalSource);

	const method = data.method;
	const isPdsMethod = method.type === 'pds';

	return (
		<Stage
			title="Enter your payload"
			onSubmit={() => {
				setError();

				const $source = source();

				let json: unknown;
				try {
					json = JSON.parse($source);
				} catch {
					setError(`Unable to parse JSON`);
					return;
				}

				const result = updatePayload.try(json);
				if (!result.ok) {
					setError(result.message);
					return;
				}

				if (method.type === 'pds') {
					onNext('Step5_PdsConfirmation', {
						info: data.info,
						method: method,
						base: data.base,
						payload: result.value,
					});
				} else if (method.type === 'private_key') {
					onNext('Step5_PrivateKeyConfirmation', {
						info: data.info,
						method: method,
						base: data.base,
						payload: result.value,
					});
				}
			}}
		>
			<MultilineInput
				label="Payload input"
				required
				autocomplete="off"
				autocorrect="off"
				value={source()}
				autofocus={isActive()}
				onChange={setSource}
			/>

			<div class="-mt-4 flex flex-wrap gap-4">
				{isPdsMethod && (
					<button
						type="button"
						class="text-[0.8125rem] leading-5 text-purple-800 hover:underline disabled:pointer-events-none"
						onClick={() => {
							const recommended = method.recommendedDidDoc;
							const payload = getPlcPayload(data.base);

							if (recommended.alsoKnownAs) {
								payload.alsoKnownAs = recommended.alsoKnownAs;
							}
							if (recommended.rotationKeys) {
								// @ts-expect-error
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

							setSource(JSON.stringify(payload, null, 2));
						}}
					>
						Use PDS recommendation
					</button>
				)}

				<button
					type="button"
					class="text-[0.8125rem] leading-5 text-purple-800 hover:underline disabled:pointer-events-none"
					onClick={() => {
						setSource(originalSource);
					}}
				>
					Reset to default
				</button>
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

export default Step4_PayloadInput;
