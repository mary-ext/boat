import { createSignal } from 'solid-js';

import { HeadersObject, XRPC } from '@atcute/client';
import { AppBskyFeedThreadgate, ComAtprotoRepoApplyWrites } from '@atcute/client/lexicons';
import { chunked } from '@mary/array-fns';

import { dequal } from '~/lib/utils/dequal';
import { createMutation } from '~/lib/utils/mutation';

import Button from '~/components/inputs/button';
import ToggleInput from '~/components/inputs/toggle-input';
import { Stage, StageActions, StageErrorView, WizardStepProps } from '~/components/wizard';

import { parseAtUri } from '~/api/utils/strings';
import { ThreadgateApplicatorConstraints } from '../page';

const Step4_Confirmation = ({
	data,
	isActive,
	onPrevious,
	onNext,
}: WizardStepProps<ThreadgateApplicatorConstraints, 'Step4_Confirmation'>) => {
	const [checked, setChecked] = createSignal(false);

	const [status, setStatus] = createSignal<string>();
	const [error, setError] = createSignal<string>();

	const mutation = createMutation({
		async mutationFn() {
			setStatus(`Preparing records`);

			const rules = data.rules;
			const writes: ComAtprotoRepoApplyWrites.Input['writes'] = [];

			const now = new Date().toISOString();
			for (const { post, threadgate } of data.threads) {
				if (threadgate === null) {
					if (rules !== undefined) {
						const { rkey } = parseAtUri(post.uri);

						const record: AppBskyFeedThreadgate.Record = {
							$type: 'app.bsky.feed.threadgate',
							createdAt: now,
							post: post.uri,
							allow: rules,
							hiddenReplies: undefined,
						};

						writes.push({
							$type: 'com.atproto.repo.applyWrites#create',
							collection: 'app.bsky.feed.threadgate',
							rkey: rkey,
							value: record,
						});
					}
				} else {
					if (rules === undefined && !threadgate.hiddenReplies?.length) {
						const { rkey } = parseAtUri(threadgate.uri);

						writes.push({
							$type: 'com.atproto.repo.applyWrites#delete',
							collection: 'app.bsky.feed.threadgate',
							rkey: rkey,
						});
					} else if (!dequal(threadgate.allow, rules)) {
						const { rkey } = parseAtUri(threadgate.uri);

						const record: AppBskyFeedThreadgate.Record = {
							$type: 'app.bsky.feed.threadgate',
							createdAt: threadgate.createdAt,
							post: post.uri,
							allow: rules,
							hiddenReplies: threadgate.hiddenReplies,
						};

						writes.push({
							$type: 'com.atproto.repo.applyWrites#update',
							collection: 'app.bsky.feed.threadgate',
							rkey: rkey,
							value: record,
						});
					}
				}
			}

			const did = data.profile.didDoc.id;
			const rpc = new XRPC({ handler: data.manager });

			const total = writes.length;
			let written = 0;
			for (const chunk of chunked(writes, 200)) {
				setStatus(`Writing records (${written}/${total})`);

				const { headers } = await rpc.call('com.atproto.repo.applyWrites', {
					data: {
						repo: did,
						writes: chunk,
					},
				});

				written += chunk.length;

				await waitForRatelimit(headers, 150 * 3);
			}
		},
		onMutate() {
			setError();
		},
		onSettled() {
			setStatus();
		},
		onSuccess() {
			onNext('Step5_Finished', {});
		},
		onError(error) {
			let message: string | undefined;

			if (message !== undefined) {
				setError(message);
			} else {
				console.error(error);
				setError(`Something went wrong: ${error}`);
			}
		},
	});

	return (
		<Stage
			title="One more step"
			disabled={mutation.isPending}
			onSubmit={() => {
				mutation.mutate();
			}}
		>
			<p class="text-pretty text-red-800">
				<b>Caution:</b> This action is irreversible. Proceed at your own risk, we assume no liability for any
				consequences.
			</p>

			<ToggleInput label="I understand" required checked={checked()} onChange={setChecked} />

			<div
				hidden={status() === undefined}
				class="whitespace-pre-wrap text-[0.8125rem] font-medium leading-5 text-gray-500"
			>
				{status()}
			</div>

			<StageErrorView error={error()} />

			<StageActions hidden={!isActive()}>
				<StageActions.Divider />

				<Button variant="secondary" onClick={onPrevious}>
					Previous
				</Button>
				<Button type="submit">Proceed</Button>
			</StageActions>
		</Stage>
	);
};

export default Step4_Confirmation;

const waitForRatelimit = async (headers: HeadersObject, expected: number) => {
	if ('ratelimit-remaining' in headers) {
		const remaining = +headers['ratelimit-remaining'];
		const reset = +headers['ratelimit-reset'] * 1_000;

		if (remaining < expected) {
			// add some delay to be sure
			const delta = reset - Date.now() + 5_000;

			await new Promise((resolve) => setTimeout(resolve, delta));
		}
	}
};
