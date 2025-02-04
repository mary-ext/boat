import { createSignal, Show } from 'solid-js';

import { XRPC, XRPCError } from '@atcute/client';
import { AppBskyFeedThreadgate, ComAtprotoRepoApplyWrites } from '@atcute/client/lexicons';
import { chunked } from '@mary/array-fns';

import { dequal } from '~/lib/utils/dequal';
import { createMutation } from '~/lib/utils/mutation';

import Button from '~/components/inputs/button';
import ToggleInput from '~/components/inputs/toggle-input';
import { Stage, StageActions, StageErrorView, WizardStepProps } from '~/components/wizard';

import { parseAtUri } from '~/api/utils/strings';
import Logger, { createLogger } from '~/components/logger';
import { ThreadgateApplicatorConstraints } from '../page';

const Step4_Confirmation = ({
	data,
	isActive,
	onPrevious,
	onNext,
}: WizardStepProps<ThreadgateApplicatorConstraints, 'Step4_Confirmation'>) => {
	const [checked, setChecked] = createSignal(false);

	const [error, setError] = createSignal<string>();

	const [isLoggerVisible, setIsLoggerVisible] = createSignal(false);
	const logger = createLogger();

	const mutation = createMutation({
		async mutationFn() {
			logger.log(`Preparing writes`);

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

			logger.log(`${writes.length} write operations to apply`);

			const did = data.profile.didDoc.id;
			const rpc = new XRPC({ handler: data.manager });

			const RATELIMIT_POINT_LIMIT = 150 * 3;

			{
				using progress = logger.progress(`Applying writes`);

				let written = 0;
				for (const chunk of chunked(writes, 200)) {
					try {
						const { headers } = await rpc.call('com.atproto.repo.applyWrites', {
							data: {
								repo: did,
								writes: chunk,
							},
						});

						written += chunk.length;
						progress.update(`Applying writes (${written} applied)`);

						if ('ratelimit-remaining' in headers) {
							const remaining = +headers['ratelimit-remaining'];
							const reset = +headers['ratelimit-reset'] * 1_000;

							if (remaining < RATELIMIT_POINT_LIMIT) {
								// add some delay to be sure
								const delta = reset - Date.now() + 5_000;
								using _progress = logger.progress(`Reached ratelimit, waiting ${delta}ms`);

								await new Promise((resolve) => setTimeout(resolve, delta));
							}
						}
					} catch (err) {
						if (!(err instanceof XRPCError) || err.kind !== 'RateLimitExceeded') {
							throw err;
						}

						const headers = err.headers;
						if ('ratelimit-remaining' in headers) {
							const remaining = +headers['ratelimit-remaining'];
							const reset = +headers['ratelimit-reset'] * 1_000;

							if (remaining < RATELIMIT_POINT_LIMIT) {
								// add some delay to be sure
								const delta = reset - Date.now() + 5_000;
								using _progress = logger.progress(`Ratelimited, waiting ${delta}ms`);

								await new Promise((resolve) => setTimeout(resolve, delta));
							}
						} else {
							using _progress = logger.progress(`Ratelimited, waiting`);

							await new Promise((resolve) => setTimeout(resolve, 60 * 1_000));
						}
					}
				}
			}
		},
		onMutate() {
			setError();
			setIsLoggerVisible(true);
		},
		onSuccess() {
			logger.log(`All writes applied`);
			onNext('Step5_Finished', {});
		},
		onError(error) {
			let message: string | undefined;

			if (message !== undefined) {
				logger.error(message);
			} else {
				console.error(error);
				logger.error(`Something went wrong:\n${error}`);
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

			<Show when={isLoggerVisible()}>
				<Logger logger={logger} />
			</Show>

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
