import { createSignal } from 'solid-js';

import { createMutation } from '~/lib/utils/mutation';

import Button from '~/components/inputs/button';
import RadioInput from '~/components/inputs/radio-input';
import TextInput from '~/components/inputs/text-input';
import { Stage, StageActions, StageErrorView, WizardStepProps } from '~/components/wizard';

import { PlcApplicatorConstraints } from '../page';
import { P256Keypair, Secp256k1Keypair } from '@atproto/crypto';

type KeyType = 'nistp256' | 'secp256k1';

const Step2_PrivateKeyInput = ({
	data,
	isActive,
	onPrevious,
	onNext,
}: WizardStepProps<PlcApplicatorConstraints, 'Step2_PrivateKeyInput'>) => {
	const [error, setError] = createSignal<string>();

	const [type, setType] = createSignal<KeyType>();
	const [hex, setHex] = createSignal('');

	const hexMutation = createMutation({
		async mutationFn({ type, hex }: { type: KeyType; hex: string }) {
			let keypair: P256Keypair | Secp256k1Keypair;

			if (type === 'nistp256') {
				keypair = await P256Keypair.import(hex);
			} else if (type === 'secp256k1') {
				keypair = await Secp256k1Keypair.import(hex);
			} else {
				throw new Error(`unsupported "${type}" type`);
			}

			return keypair;
		},
		onMutate() {
			setError();
		},
		onSuccess(keypair) {
			onNext('Step3_OperationSelect', {
				info: data.info,
				method: {
					type: 'private_key',
					didPublicKey: keypair.did(),
					keypair: keypair,
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
			title="Enter your private key"
			disabled={hexMutation.isPending}
			onSubmit={() => {
				hexMutation.mutate({
					type: type()!,
					hex: hex(),
				});
			}}
		>
			<TextInput
				label="Hex-encoded private key"
				blurb="This app runs locally on your browser, your private key stays entirely within your device."
				placeholder="a5973930f9d348..."
				value={hex()}
				required
				pattern="[0-9a-f]+"
				autofocus={isActive()}
				onChange={setHex}
			/>

			<RadioInput
				label="This is a..."
				value={type()}
				required
				options={[
					{ value: 'secp256k1', label: `ES256K (secp256k1) private key` },
					{ value: 'nistp256', label: `ES256 (nistp256) private key` },
				]}
				onChange={setType}
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

export default Step2_PrivateKeyInput;
