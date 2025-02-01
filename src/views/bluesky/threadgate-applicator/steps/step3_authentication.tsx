import { batch, createSignal } from 'solid-js';

import { CredentialManager } from '@atcute/client';

import { WizardStepProps } from '~/components/wizard';
import BlueskyLoginStep from '~/components/wizards/bluesky-login-step';

import { ThreadgateApplicatorConstraints } from '../page';

const Step3_Authentication = ({
	data,
	isActive,
	onPrevious,
	onNext,
}: WizardStepProps<ThreadgateApplicatorConstraints, 'Step3_Authentication'>) => {
	const [manager, setManager] = createSignal<CredentialManager>();

	return (
		<BlueskyLoginStep
			manager={manager()}
			didDocument={/* @once */ data.profile.didDoc}
			isActive={isActive()}
			onAuthorize={(manager) => {
				batch(() => {
					setManager(manager);
					onNext('Step4_Confirmation', { ...data, manager });
				});
			}}
			onUnauthorize={setManager}
			onPrevious={onPrevious}
		/>
	);
};

export default Step3_Authentication;
