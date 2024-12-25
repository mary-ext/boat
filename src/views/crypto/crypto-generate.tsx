import { createSignal, Show } from 'solid-js';

import {
	createP256Keypair,
	createSecp256k1Keypair,
	type P256PrivateKeyExportable,
	type Secp256k1PrivateKeyExportable,
} from '@atcute/crypto';

import { useTitle } from '~/lib/navigation/router';

import Button from '~/components/inputs/button';
import RadioInput from '~/components/inputs/radio-input';

type KeyType = 'nistp256' | 'secp256k1';

type Keypair = P256PrivateKeyExportable | Secp256k1PrivateKeyExportable;

const CryptoGeneratePage = () => {
	const [type, setType] = createSignal<KeyType>('secp256k1');
	const [result, setResult] = createSignal<Keypair>();

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
					let keypair: Keypair;

					if ($type === 'nistp256') {
						keypair = createP256Keypair();
					} else if ($type === 'secp256k1') {
						keypair = createSecp256k1Keypair();
					} else {
						return;
					}

					setResult(keypair);
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
							<span class="font-mono">{/* @once */ keypair.did()}</span>
						</div>

						<div>
							<p class="font-semibold text-gray-600">Private key (hex)</p>
							<span class="font-mono">{/* @once */ keypair.export('hex')}</span>
						</div>

						<div>
							<p class="font-semibold text-gray-600">Private key (multikey)</p>
							<span class="font-mono">{/* @once */ keypair.export('multikey')}</span>
						</div>
					</div>
				)}
			</Show>
		</>
	);
};

export default CryptoGeneratePage;
