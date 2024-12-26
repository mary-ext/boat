import { createMemo, createSignal, Match, Show, Switch } from 'solid-js';

import { P256PrivateKey, parsePrivateMultikey, Secp256k1PrivateKey } from '@atcute/crypto';
import { fromBase16 } from '@atcute/multibase';

import { createMutation } from '~/lib/utils/mutation';

import Button from '~/components/inputs/button';
import RadioInput from '~/components/inputs/radio-input';
import TextInput from '~/components/inputs/text-input';
import { Stage, StageActions, StageErrorView, WizardStepProps } from '~/components/wizard';

import { PlcApplicatorConstraints } from '../page';

type KeyType = 'p256' | 'secp256k1';
type KeyFormat = 'hex' | 'multikey';

const HEX_REGEX = /^[0-9a-f]+$/;
const MULTIKEY_REGEX = /^z[a-km-zA-HJ-NP-Z1-9]+$/;

const Step2_PrivateKeyInput = ({
	data,
	isActive,
	onPrevious,
	onNext,
}: WizardStepProps<PlcApplicatorConstraints, 'Step2_PrivateKeyInput'>) => {
	const [error, setError] = createSignal<string>();

	const [type, setType] = createSignal<KeyType>();
	const [input, setInput] = createSignal('');

	const detectedFormat = createMemo((): KeyFormat | undefined => {
		const $input = input();

		if (HEX_REGEX.test($input)) {
			return 'hex';
		}
		if (MULTIKEY_REGEX.test($input)) {
			return 'multikey';
		}
	});

	const mutation = createMutation({
		async mutationFn({ type, input }: { type: KeyType; input: string }) {
			if (HEX_REGEX.test(input)) {
				const privateKey = fromBase16(input);

				switch (type) {
					case 'p256': {
						return new P256PrivateKey(privateKey);
					}
					case 'secp256k1': {
						return new Secp256k1PrivateKey(privateKey);
					}
				}

				throw new Error(`unsupported "${type}" type`);
			}

			if (MULTIKEY_REGEX.test(input)) {
				const match = parsePrivateMultikey(input);
				const privateKey = match.privateKey;

				switch (match.type) {
					case 'p256': {
						return new P256PrivateKey(privateKey);
					}
					case 'secp256k1': {
						return new Secp256k1PrivateKey(privateKey);
					}
				}

				throw new Error(`unsupported "${type}" type`);
			}

			throw new Error(`unknown input format`);
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
			disabled={mutation.isPending}
			onSubmit={() => {
				mutation.mutate({
					type: type()!,
					input: input(),
				});
			}}
		>
			<Switch>
				<Match when={!isActive() && mutation.data} keyed>
					{(keypair) => (
						<div class="break-words">
							<p>
								<b>{/* @once */ keypair.type}</b> keypair provided.
							</p>
							<p class="mt-2 font-mono font-medium">{/* @once */ keypair.did()}</p>
						</div>
					)}
				</Match>

				<Match when>
					<TextInput
						label="Private key (hex or multikey)"
						blurb="This app runs locally on your browser, your private key stays entirely within your device."
						type={isActive() ? 'text' : 'password'}
						autocomplete="off"
						autocorrect="off"
						placeholder="a5973930f9d348..."
						value={input()}
						required
						autofocus={isActive()}
						onChange={setInput}
					/>

					<Show when={detectedFormat() === 'hex'}>
						<RadioInput
							label="This is a..."
							value={type()}
							required
							options={[
								{ value: 'secp256k1', label: `ES256K (secp256k1) private key` },
								{ value: 'p256', label: `ES256 (p256) private key` },
							]}
							onChange={setType}
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
				<Button type="submit" disabled={!detectedFormat()}>
					Next
				</Button>
			</StageActions>
		</Stage>
	);
};

export default Step2_PrivateKeyInput;
