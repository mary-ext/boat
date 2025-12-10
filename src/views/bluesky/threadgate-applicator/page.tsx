import { createEffect, createSignal, onCleanup } from 'solid-js';

import { AppBskyFeedDefs, AppBskyFeedThreadgate } from '@atcute/bluesky';
import { CredentialManager } from '@atcute/client';
import type { DidDocument } from '@atcute/identity';

import type { UnwrapArray } from '~/api/utils/types';

import { history } from '~/globals/navigation';

import { useTitle } from '~/lib/navigation/router';

import PageHeader from '~/components/page-header';
import { Wizard } from '~/components/wizard';

import Step1_HandleInput from './steps/step1_handle-input';
import Step2_RulesInput from './steps/step2_rules-input';
import Step3_Authentication from './steps/step3_authentication';
import Step4_Confirmation from './steps/step4_confirmation';
import Step5_Finished from './steps/step5_finished';

export interface ThreadgateState extends Pick<
	AppBskyFeedThreadgate.Main,
	'allow' | 'hiddenReplies' | 'createdAt'
> {
	uri: string;
}

export type ThreadgateRule = UnwrapArray<AppBskyFeedThreadgate.Main['allow']>;

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

	useTitle(() => `Retroactive thread gating — boat`);

	return (
		<>
			<PageHeader title="Retroactive thread gating" subtitle="Set reply permissions on all of your past Bluesky posts" />

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
