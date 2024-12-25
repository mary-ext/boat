import { createEffect, createSignal, onCleanup } from 'solid-js';

import type { CredentialManager } from '@atcute/client';
import type { ComAtprotoIdentityGetRecommendedDidCredentials } from '@atcute/client/lexicons';
import type { P256PrivateKey, Secp256k1PrivateKey } from '@atcute/crypto';

import type { DidDocument } from '~/api/types/did-doc';
import type { PlcUpdatePayload } from '~/api/types/plc';

import { history } from '~/globals/navigation';

import { useTitle } from '~/lib/navigation/router';

import { Wizard } from '~/components/wizard';

import type { DetailedPlcEntry } from './plc-utils';

import Step1_HandleInput from './steps/step1_handle-input';
import Step2_PdsAuthentication from './steps/step2_pds-authentication';
import Step2_PrivateKeyInput from './steps/step2_private-key-input';
import Step3_OperationSelect from './steps/step3_operation-select';
import Step4_PayloadInput from './steps/step4_payload-input';
import Step5_PdsConfirmation from './steps/step5_pds-confirmation';
import Step5_PrivateKeyConfirmation from './steps/step5_private-key-confirmation';
import Step6_Finished from './steps/step6_finished';

export interface PlcInformation {
	didDoc: DidDocument;
	logs: DetailedPlcEntry[];
}

export interface PdsSigningMethod {
	type: 'pds';
	manager: CredentialManager;
	recommendedDidDoc: ComAtprotoIdentityGetRecommendedDidCredentials.Output;
}

type Keypair = P256PrivateKey | Secp256k1PrivateKey;
export interface PrivateKeySigningMethod {
	type: 'private_key';
	keypair: Keypair;
	didPublicKey: string;
}

export type SigningMethod = PdsSigningMethod | PrivateKeySigningMethod;

export type PlcApplicatorConstraints = {
	Step1_HandleInput: {};

	Step2_PdsAuthentication: {
		info: PlcInformation;
	};
	Step2_PrivateKeyInput: {
		info: PlcInformation;
	};

	Step3_OperationSelect: {
		info: PlcInformation;
		method: SigningMethod;
	};

	Step4_PayloadInput: {
		info: PlcInformation;
		method: SigningMethod;
		base: DetailedPlcEntry;
	};

	Step5_PdsConfirmation: {
		info: PlcInformation;
		method: PdsSigningMethod;
		base: DetailedPlcEntry;
		payload: PlcUpdatePayload;
	};
	Step5_PrivateKeyConfirmation: {
		info: PlcInformation;
		method: PrivateKeySigningMethod;
		base: DetailedPlcEntry;
		payload: PlcUpdatePayload;
	};

	Step6_Finished: {};
};

const PlcApplicatorPage = () => {
	const [isActive, setIsActive] = createSignal(false);

	createEffect(() => {
		if (isActive()) {
			const cleanup = history.block((tx) => {
				if (window.confirm(`Abort this action?`)) {
					cleanup();
					tx.retry();
				}
			});

			onCleanup(cleanup);
		}
	});

	useTitle(() => `Apply PLC operations — boat`);

	return (
		<>
			<div class="p-4">
				<h1 class="text-lg font-bold text-purple-800">Apply PLC operations</h1>
				<p class="text-gray-600">Submit operations to your did:plc identity</p>
			</div>
			<hr class="mx-4 border-gray-300" />

			<Wizard<PlcApplicatorConstraints>
				initialStep="Step1_HandleInput"
				components={{
					Step1_HandleInput,
					Step2_PdsAuthentication,
					Step2_PrivateKeyInput,
					Step3_OperationSelect,
					Step4_PayloadInput,
					Step5_PdsConfirmation,
					Step5_PrivateKeyConfirmation,
					Step6_Finished,
				}}
				onStepChange={(step) => setIsActive(step > 1 && step < 6)}
			/>
		</>
	);
};

export default PlcApplicatorPage;
