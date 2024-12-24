import { Stage, WizardStepProps } from '~/components/wizard';

import { PlcApplicatorConstraints } from '../page';

export const Step6_Finished = ({}: WizardStepProps<PlcApplicatorConstraints, 'Step6_Finished'>) => {
	return (
		<Stage title="All done!">
			<div>
				<p class="text-pretty">Your did:plc identity has been updated.</p>

				<p class="mt-3 text-pretty">
					You can close this page, or reload the page if you intend on doing another submission.
				</p>
			</div>
		</Stage>
	);
};

export default Step6_Finished;
