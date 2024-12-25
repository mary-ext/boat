import { createSignal, Show } from 'solid-js';

import { P256Keypair, Secp256k1Keypair } from '@atproto/crypto';
import { concat, toString } from 'uint8arrays';

import { useTitle } from '~/lib/navigation/router';
import { K256_PRIVATE_PREFIX, P256_PRIVATE_PREFIX } from '~/lib/utils/crypto';

import Button from '~/components/inputs/button';
import RadioInput from '~/components/inputs/radio-input';

type KeyType = 'nistp256' | 'secp256k1';

interface GeneratedKeypair {
	type: KeyType;
	publicDidKey: string;
	privateBytes: Uint8Array;
	privateMultibase: string;
	privateHex: string;
}

const CryptoGeneratePage = () => {
	const [type, setType] = createSignal<KeyType>('secp256k1');
	const [result, setResult] = createSignal<GeneratedKeypair>();

	useTitle(() => `Generate secret keys — boat`);

	return (
		<>
			<div class="p-4">
				<h1 class="text-lg font-bold text-purple-800">Generate secret keys</h1>
				<p class="text-gray-600">Create a new secp256k1/nistp256 keypair</p>
			</div>
			<hr class="mx-4 border-gray-300" />

			<form
				onSubmit={async (ev) => {
					ev.preventDefault();

					const $type = type();

					let keypair: P256Keypair | Secp256k1Keypair;

					let publicDidKey: string;

					let privateBytes: Uint8Array;
					let privateMultibase: string;
					let privateHex: string;

					if ($type === 'nistp256') {
						keypair = await P256Keypair.create({ exportable: true });

						privateBytes = await keypair.export();
						privateMultibase = `z` + toString(concat([P256_PRIVATE_PREFIX, privateBytes]), 'base58btc');
						privateHex = toString(privateBytes, 'hex');

						publicDidKey = keypair.did();
					} else if ($type === 'secp256k1') {
						keypair = await Secp256k1Keypair.create({ exportable: true });

						privateBytes = await keypair.export();
						privateMultibase = `z` + toString(concat([K256_PRIVATE_PREFIX, privateBytes]), 'base58btc');
						privateHex = toString(privateBytes, 'hex');

						publicDidKey = keypair.did();
					} else {
						return;
					}

					const result: GeneratedKeypair = {
						type: $type,
						publicDidKey,
						privateBytes,
						privateMultibase,
						privateHex,
					};

					setResult(result);
				}}
				class="flex flex-col gap-4 p-4"
			>
				<RadioInput
					label="Key type"
					name="type"
					required
					value={type()}
					options={[
						{ value: 'secp256k1', label: `ES256K (secp256k1) private key` },
						{ value: 'nistp256', label: `ES256 (nistp256) private key` },
					]}
					onChange={setType}
				/>

				<div>
					<Button type="submit">Generate</Button>
				</div>
			</form>
			<hr class="mx-4 border-gray-300" />

			<Show when={result()} keyed>
				{(keypair) => (
					<div class="flex flex-col gap-6 break-words p-4 text-gray-900">
						<div>
							<p class="font-semibold text-gray-600">Key type</p>
							<span>{/* @once */ keypair.type}</span>
						</div>

						<div>
							<p class="font-semibold text-gray-600">Public key (did:key)</p>
							<span class="font-mono">{/* @once */ keypair.publicDidKey}</span>
						</div>

						<div>
							<p class="font-semibold text-gray-600">Private key (hex)</p>
							<span class="font-mono">{/* @once */ keypair.privateHex}</span>
						</div>

						<div>
							<p class="font-semibold text-gray-600">Private key (multibase)</p>
							<span class="font-mono">{/* @once */ keypair.privateMultibase}</span>
						</div>
					</div>
				)}
			</Show>
		</>
	);
};

export default CryptoGeneratePage;
