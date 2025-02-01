import { createEffect, createSignal, onCleanup } from 'solid-js';

import { CredentialManager } from '@atcute/client';
import { AppBskyFeedDefs, AppBskyFeedThreadgate } from '@atcute/client/lexicons';

import { DidDocument } from '~/api/types/did-doc';
import { UnwrapArray } from '~/api/utils/types';

import { history } from '~/globals/navigation';

import { Wizard } from '~/components/wizard';

import Step1_HandleInput from './steps/step1_handle-input';
import Step2_RulesInput from './steps/step2_rules-input';
import Step3_Authentication from './steps/step3_authentication';
import Step4_Confirmation from './steps/step4_confirmation';
import Step5_Finished from './steps/step5_finished';

export interface ThreadgateState
	extends Pick<AppBskyFeedThreadgate.Record, 'allow' | 'hiddenReplies' | 'createdAt'> {
	uri: string;
}

export type ThreadgateRule = UnwrapArray<AppBskyFeedThreadgate.Record['allow']>;

export interface ThreadItem {
	post: AppBskyFeedDefs.PostView;
	threadgate: ThreadgateState | null;
}

export interface ProfileInfo {
	didDoc: DidDocument;
}

export type ThreadgateApplicatorConstraints = {
	Step1_HandleInput: {};

	Step2_RulesInput: {
		profile: ProfileInfo;
		threads: ThreadItem[];
	};

	Step3_Authentication: {
		profile: ProfileInfo;
		threads: ThreadItem[];
		rules: ThreadgateRule[] | undefined;
	};

	Step4_Confirmation: {
		profile: ProfileInfo;
		manager: CredentialManager;
		threads: ThreadItem[];
		rules: ThreadgateRule[] | undefined;
	};

	Step5_Finished: {};
};

const ThreadgateApplicatorPage = () => {
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

	return (
		<>
			<div class="p-4">
				<h1 class="text-lg font-bold text-purple-800">Retroactive thread gating</h1>
				<p class="text-gray-600">Set reply permissions on all of your past Bluesky posts</p>
			</div>
			<hr class="mx-4 border-gray-300" />

			<Wizard<ThreadgateApplicatorConstraints>
				initialStep="Step1_HandleInput"
				components={{
					Step1_HandleInput,
					Step2_RulesInput,
					Step3_Authentication,
					Step4_Confirmation,
					Step5_Finished,
				}}
				onStepChange={(step) => setIsActive(step > 1 && step < 5)}
			/>
		</>
	);
};

export default ThreadgateApplicatorPage;
