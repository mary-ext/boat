import { createMemo, createSignal, Match, Show, Switch } from 'solid-js';

import {
	type DidKeyString,
	P256PrivateKeyExportable,
	P256PublicKey,
	parseDidKey,
	parsePrivateMultikey,
	parsePublicMultikey,
	Secp256k1PrivateKeyExportable,
	Secp256k1PublicKey,
} from '@atcute/crypto';
import { fromBase16 } from '@atcute/multibase';

import { useTitle } from '~/lib/navigation/router';

import Button from '~/components/inputs/button';
import RadioInput from '~/components/inputs/radio-input';
import TextInput from '~/components/inputs/text-input';
import PageHeader from '~/components/page-header';

type KeyType = 'p256' | 'secp256k1';
type KeyFormat = 'did:key' | 'multikey' | 'hex';

interface KeyInfo {
	keyType: KeyType;
	isPrivate: boolean;
	inputFormat: KeyFormat;
	publicDidKey: DidKeyString;
	publicMultikey: string;
	privateHex?: string;
	privateMultikey?: string;
}

const DID_KEY_REGEX = /^did:key:z[a-km-zA-HJ-NP-Z1-9]+$/;
const MULTIKEY_REGEX = /^z[a-km-zA-HJ-NP-Z1-9]+$/;
const HEX_REGEX = /^[0-9a-f]+$/;

const CryptoInfoPage = () => {
	const [input, setInput] = createSignal('');
	const [hexKeyType, setHexKeyType] = createSignal<KeyType>();
	const [result, setResult] = createSignal<KeyInfo>();
	const [error, setError] = createSignal<string>();

	const detectedFormat = createMemo((): KeyFormat | undefined => {
		const $input = input().trim();

		if (DID_KEY_REGEX.test($input)) {
			return 'did:key';
		}
		if (MULTIKEY_REGEX.test($input)) {
			return 'multikey';
		}
		if (HEX_REGEX.test($input)) {
			return 'hex';
		}
	});

	const canSubmit = createMemo(() => {
		const format = detectedFormat();
		if (!format) {
			return false;
		}
		if (format === 'hex' && !hexKeyType()) {
			return false;
		}
		return true;
	});

	useTitle(() => `View crypto key info — boat`);

	return (
		<>
			<PageHeader title="View crypto key info" subtitle="Show basic metadata about a public or private key" />

			<form
				onSubmit={async (ev) => {
					ev.preventDefault();

					const $input = input().trim();
					const format = detectedFormat();

					setResult();
					setError();

					try {
						let info: KeyInfo;

						if (format === 'did:key') {
							const parsed = parseDidKey($input);
							const pubKey =
								parsed.type === 'p256'
									? await P256PublicKey.importRaw(parsed.publicKeyBytes)
									: await Secp256k1PublicKey.importRaw(parsed.publicKeyBytes);

							info = {
								keyType: parsed.type,
								isPrivate: false,
								inputFormat: 'did:key',
								publicDidKey: await pubKey.exportPublicKey('did'),
								publicMultikey: await pubKey.exportPublicKey('multikey'),
							};
						} else if (format === 'multikey') {
							// try parsing as private key first
							try {
								const parsed = parsePrivateMultikey($input);
								const privKey =
									parsed.type === 'p256'
										? await P256PrivateKeyExportable.importRaw(parsed.privateKeyBytes)
										: await Secp256k1PrivateKeyExportable.importRaw(parsed.privateKeyBytes);

								info = {
									keyType: parsed.type,
									isPrivate: true,
									inputFormat: 'multikey',
									publicDidKey: await privKey.exportPublicKey('did'),
									publicMultikey: await privKey.exportPublicKey('multikey'),
									privateHex: await privKey.exportPrivateKey('rawHex'),
									privateMultikey: await privKey.exportPrivateKey('multikey'),
								};
							} catch {
								// try parsing as public key
								const parsed = parsePublicMultikey($input);
								const pubKey =
									parsed.type === 'p256'
										? await P256PublicKey.importRaw(parsed.publicKeyBytes)
										: await Secp256k1PublicKey.importRaw(parsed.publicKeyBytes);

								info = {
									keyType: parsed.type,
									isPrivate: false,
									inputFormat: 'multikey',
									publicDidKey: await pubKey.exportPublicKey('did'),
									publicMultikey: await pubKey.exportPublicKey('multikey'),
								};
							}
						} else if (format === 'hex') {
							const keyType = hexKeyType()!;
							const privateKeyBytes = fromBase16($input);

							const privKey =
								keyType === 'p256'
									? await P256PrivateKeyExportable.importRaw(privateKeyBytes)
									: await Secp256k1PrivateKeyExportable.importRaw(privateKeyBytes);

							info = {
								keyType: keyType,
								isPrivate: true,
								inputFormat: 'hex',
								publicDidKey: await privKey.exportPublicKey('did'),
								publicMultikey: await privKey.exportPublicKey('multikey'),
								privateHex: await privKey.exportPrivateKey('rawHex'),
								privateMultikey: await privKey.exportPrivateKey('multikey'),
							};
						} else {
							throw new Error('Unknown key format');
						}

						setResult(info);
					} catch (err) {
						console.error(err);
						setError(`Failed to parse key: ${err}`);
					}
				}}
				class="flex flex-col gap-4 p-4"
			>
				<TextInput
					label="Public or private key"
					blurb="Accepts did:key, multikey, or hex format"
					monospace
					autocomplete="off"
					autocorrect="off"
					placeholder="did:key:z... or z... or a5973930f9d348..."
					value={input()}
					required
					onChange={setInput}
				/>

				<Show when={detectedFormat() === 'hex'}>
					<RadioInput
						label="This is a..."
						value={hexKeyType()}
						required
						options={[
							{ value: 'secp256k1', label: `ES256K (secp256k1) private key` },
							{ value: 'p256', label: `ES256 (p256) private key` },
						]}
						onChange={setHexKeyType}
					/>
				</Show>

				<div>
					<Button type="submit" disabled={!canSubmit()}>
						Inspect
					</Button>
				</div>
			</form>

			<hr class="mx-4 border-gray-300" />

			<Switch>
				<Match when={error()}>
					<div class="p-4 text-red-600">{error()}</div>
				</Match>

				<Match when={result()} keyed>
					{(info) => (
						<div class="flex flex-col gap-6 break-words p-4 text-gray-900">
							<div>
								<p class="font-semibold text-gray-600">Key type</p>
								<span>
									{/* @once */ info.keyType === 'p256'
										? 'ES256 (p256)'
										: 'ES256K (secp256k1)'}{' '}
									{/* @once */ info.isPrivate ? 'private' : 'public'} key
								</span>
							</div>

							<div>
								<p class="font-semibold text-gray-600">Input encoding</p>
								<span>{/* @once */ info.inputFormat}</span>
							</div>

							<div>
								<p class="font-semibold text-gray-600">Public key (did:key)</p>
								<span class="font-mono">{/* @once */ info.publicDidKey}</span>
							</div>

							<div>
								<p class="font-semibold text-gray-600">Public key (multikey)</p>
								<span class="font-mono">{/* @once */ info.publicMultikey}</span>
							</div>

							<Show when={info.privateHex}>
								<div>
									<p class="font-semibold text-gray-600">Private key (hex)</p>
									<span class="font-mono">{/* @once */ info.privateHex}</span>
								</div>
							</Show>

							<Show when={info.privateMultikey}>
								<div>
									<p class="font-semibold text-gray-600">Private key (multikey)</p>
									<span class="font-mono">{/* @once */ info.privateMultikey}</span>
								</div>
							</Show>
						</div>
					)}
				</Match>
			</Switch>
		</>
	);
};

export default CryptoInfoPage;
