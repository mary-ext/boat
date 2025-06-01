import { createSignal, Show } from 'solid-js';

import type { ComAtprotoRepoApplyWrites } from '@atcute/atproto';
import type { AppBskyFeedThreadgate } from '@atcute/bluesky';
import { Client, ClientResponseError } from '@atcute/client';
import { parseCanonicalResourceUri } from '@atcute/lexicons';
import { chunked } from '@mary/array-fns';

import { dequal } from '~/lib/utils/dequal';
import { createMutation } from '~/lib/utils/mutation';

import Button from '~/components/inputs/button';
import ToggleInput from '~/components/inputs/toggle-input';
import Logger, { createLogger } from '~/components/logger';
import { Stage, StageActions, StageErrorView, type WizardStepProps } from '~/components/wizard';

import type { ThreadgateApplicatorConstraints } from '../page';

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
			const writes: ComAtprotoRepoApplyWrites.$input['writes'] = [];

			const now = new Date().toISOString();
			for (const { post, threadgate } of data.threads) {
				if (threadgate === null) {
					if (rules !== undefined) {
						const postUri = parseCanonicalResourceUri(post.uri);
						if (!postUri.ok) {
							throw new Error(`failed to parse ${post.uri}`);
						}

						const record: AppBskyFeedThreadgate.Main = {
							$type: 'app.bsky.feed.threadgate',
							createdAt: now,
							post: post.uri,
							allow: rules,
							hiddenReplies: undefined,
						};

						writes.push({
							$type: 'com.atproto.repo.applyWrites#create',
							collection: 'app.bsky.feed.threadgate',
							rkey: postUri.value.rkey,
							value: record,
						});
					}
				} else {
					if (rules === undefined && !threadgate.hiddenReplies?.length) {
						const threadgateUri = parseCanonicalResourceUri(threadgate.uri);
						if (!threadgateUri.ok) {
							throw new Error(`failed to parse ${threadgate.uri}`);
						}

						writes.push({
							$type: 'com.atproto.repo.applyWrites#delete',
							collection: 'app.bsky.feed.threadgate',
							rkey: threadgateUri.value.rkey,
						});
					} else if (!dequal(threadgate.allow, rules)) {
						const threadgateUri = parseCanonicalResourceUri(threadgate.uri);
						if (!threadgateUri.ok) {
							throw new Error(`failed to parse ${threadgate.uri}`);
						}

						const record: AppBskyFeedThreadgate.Main = {
							$type: 'app.bsky.feed.threadgate',
							createdAt: threadgate.createdAt,
							post: post.uri,
							allow: rules,
							hiddenReplies: threadgate.hiddenReplies,
						};

						writes.push({
							$type: 'com.atproto.repo.applyWrites#update',
							collection: 'app.bsky.feed.threadgate',
							rkey: threadgateUri.value.rkey,
							value: record,
						});
					}
				}
			}

			logger.log(`${writes.length} write operations to apply`);

			const did = data.profile.didDoc.id;
			const client = new Client({ handler: data.manager });

			{
				using progress = logger.progress(`Applying writes`);

				let written = 0;
				for (const chunk of chunked(writes, 200)) {
					let attempts = 0;

					while (true) {
						if (attempts > 0) {
							await sleep(2_000);
						}

						attempts++;

						try {
							const response = await client.post('com.atproto.repo.applyWrites', {
								input: {
									repo: did,
									writes: chunk,
								},
							});

							if (response.ok) {
								written += chunk.length;
								progress.update(`Applying writes (${written} applied)`);
								break;
							}

							if (response.status === 429) {
								// not exposed by CORS, hoping that someday it will
								const reset = response.headers.get('ratelimit-reset');

								using _progress = logger.progress(`Ratelimited, waiting`);

								if (reset !== null) {
									const refreshAt = +reset * 1_000;
									const delta = refreshAt - Date.now();

									await sleep(delta);
								} else {
									await sleep(10_000);
								}
							}

							if (attempts < 3) {
								continue;
							}

							throw new ClientResponseError(response);
						} catch (err) {
							// Network errors, etc
							if (attempts < 3) {
								continue;
							}

							throw err;
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

const sleep = (ms: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};
