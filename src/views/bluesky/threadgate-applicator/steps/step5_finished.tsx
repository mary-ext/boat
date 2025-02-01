import { Stage, WizardStepProps } from '~/components/wizard';

import { ThreadgateApplicatorConstraints } from '../page';

export const Step5_Finished = ({}: WizardStepProps<ThreadgateApplicatorConstraints, 'Step5_Finished'>) => {
	return (
		<Stage title="All done!">
			<div>
				<p class="text-pretty">Thread gating option has been applied.</p>

				<p class="mt-3 text-pretty">
					You can close this page, or reload the page if you intend on doing another submission.
				</p>
			</div>
		</Stage>
	);
};

export default Step5_Finished;
