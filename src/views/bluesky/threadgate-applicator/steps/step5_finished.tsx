import { Stage, WizardStepProps } from '~/components/wizard';

import { ThreadgateApplicatorConstraints } from '../page';

export const Step5_Finished = ({}: WizardStepProps<ThreadgateApplicatorConstraints, 'Step5_Finished'>) => {
	return (
		<Stage title="All done!">
			<div>
				<p class="text-pretty">Thread gating has been applied.</p>

				<p class="mt-3 text-pretty">
					You can revoke the app password and close this page now, or reload the page if you intend on
					changing your mind.
				</p>
			</div>
		</Stage>
	);
};

export default Step5_Finished;
