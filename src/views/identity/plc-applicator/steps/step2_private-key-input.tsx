import { createMemo, createSignal, Match, Show, Switch } from 'solid-js';

import { P256PrivateKey, parsePrivateMultikey, Secp256k1PrivateKey } from '@atcute/crypto';
import { fromBase16 } from '@atcute/multibase';

import { createMutation } from '~/lib/utils/mutation';

import Button from '~/components/inputs/button';
import RadioInput from '~/components/inputs/radio-input';
import TextInput from '~/components/inputs/text-input';
import { Stage, StageActions, StageErrorView, WizardStepProps } from '~/components/wizard';

import type { Keypair, PlcApplicatorConstraints, PrivateKeySigningMethod } from '../page';

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
		async mutationFn({ type, input }: { type: KeyType; input: string }): Promise<PrivateKeySigningMethod> {
			let keypair: Keypair | undefined;

			if (HEX_REGEX.test(input)) {
				const privateKeyBytes = fromBase16(input);

				switch (type) {
					case 'p256': {
						keypair = await P256PrivateKey.importRaw(privateKeyBytes);
						break;
					}
					case 'secp256k1': {
						keypair = await Secp256k1PrivateKey.importRaw(privateKeyBytes);
						break;
					}
					default: {
						throw new Error(`unsupported "${type}" type`);
					}
				}
			} else if (MULTIKEY_REGEX.test(input)) {
				const match = parsePrivateMultikey(input);
				const privateKeyBytes = match.privateKeyBytes;

				switch (match.type) {
					case 'p256': {
						keypair = await P256PrivateKey.importRaw(privateKeyBytes);
						break;
					}
					case 'secp256k1': {
						keypair = await Secp256k1PrivateKey.importRaw(privateKeyBytes);
						break;
					}
					default: {
						throw new Error(`unsupported "${type}" type`);
					}
				}
			} else {
				throw new Error(`unknown input format`);
			}

			return {
				type: 'private_key',
				didPublicKey: await keypair.exportPublicKey('did'),
				keypair: keypair,
			};
		},
		onMutate() {
			setError();
		},
		onSuccess(method) {
			onNext('Step3_OperationSelect', {
				info: data.info,
				method,
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
					{(method) => (
						<div class="break-words">
							<p>
								<b>{/* @once */ method.keypair.type}</b> keypair provided.
							</p>
							<p class="mt-2 font-mono font-medium">{/* @once */ method.didPublicKey}</p>
						</div>
					)}
				</Match>

				<Match when>
					<TextInput
						label="Private key (raw hex or multikey)"
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
