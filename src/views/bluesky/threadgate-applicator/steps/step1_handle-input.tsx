import { createSignal } from 'solid-js';

import type { AppBskyFeedThreadgate, At } from '@atcute/client/lexicons';

import { getDidDocument } from '~/api/queries/did-doc';
import { resolveHandleViaAppView } from '~/api/queries/handle';
import { DID_OR_HANDLE_RE, isDid } from '~/api/utils/strings';

import { appViewRpc } from '~/globals/rpc';

import { createMutation } from '~/lib/utils/mutation';

import Button from '~/components/inputs/button';
import TextInput from '~/components/inputs/text-input';
import { Stage, StageActions, StageErrorView, WizardStepProps } from '~/components/wizard';

import { ThreadgateApplicatorConstraints, ThreadgateState, ThreadItem } from '../page';
import { sortThreadgateState } from '../utils';

class NoThreadsError extends Error {}

const Step1_HandleInput = ({
	isActive,
	onNext,
}: WizardStepProps<ThreadgateApplicatorConstraints, 'Step1_HandleInput'>) => {
	const [identifier, setIdentifier] = createSignal('');

	const [status, setStatus] = createSignal<string>();
	const [error, setError] = createSignal<string>();

	const mutation = createMutation({
		async mutationFn({ identifier }: { identifier: string }, signal) {
			setStatus(`Resolving identity`);

			let did: At.DID;
			if (isDid(identifier)) {
				did = identifier;
			} else {
				did = await resolveHandleViaAppView({ handle: identifier, signal });
			}

			const didDoc = await getDidDocument({ did, signal });

			setStatus(`Looking up your posts`);

			const threads = new Map<string, ThreadItem>();

			let cursor: string | undefined;
			do {
				const { data } = await appViewRpc.get('app.bsky.feed.getAuthorFeed', {
					signal,
					params: {
						actor: did,
						filter: 'posts_no_replies',
						limit: 100,
						cursor,
					},
				});

				cursor = data.cursor;

				for (const item of data.feed) {
					const post = item.post;

					// This is a reply, skip, we're only interested in root posts
					if (item.reply) {
						continue;
					}

					// This is a repost
					if (item.reason?.$type === 'app.bsky.feed.defs#reasonRepost') {
						// This is a repost of another user's post, skip
						if (post.author.did !== did) {
							continue;
						}
					}

					const tg = post.threadgate;

					let threadgate: ThreadgateState | null = null;

					if (tg?.record) {
						const record = tg.record as AppBskyFeedThreadgate.Record;

						const allow = record?.allow;
						const hiddenReplies = record?.hiddenReplies;

						threadgate = {
							uri: tg.uri!,
							createdAt: record.createdAt,
							allow: allow,
							hiddenReplies: hiddenReplies?.length ? hiddenReplies : undefined,
						};

						sortThreadgateState(threadgate);
					}

					threads.set(post.uri, { post, threadgate });
				}

				setStatus(`Looking up your posts (found ${threads.size} threads)`);
			} while (cursor !== undefined);

			if (threads.size === 0) {
				throw new NoThreadsError(`You have no threads posted!`);
			}

			return { didDoc, threads };
		},
		onMutate() {
			setError();
		},
		onSuccess({ didDoc, threads }) {
			onNext('Step2_RulesInput', {
				profile: { didDoc },
				threads: Array.from(threads.values()),
			});
		},
		onError(error) {
			let message: string | undefined;

			if (error instanceof NoThreadsError) {
				message = error.message;
			}

			if (message !== undefined) {
				setError(message);
			} else {
				console.error(error);
				setError(`Something went wrong: ${error}`);
			}
		},
		onSettled() {
			setStatus();
		},
	});

	return (
		<Stage
			title="Enter your Bluesky handle"
			disabled={mutation.isPending}
			onSubmit={() => {
				mutation.mutate({
					identifier: identifier(),
				});
			}}
		>
			<TextInput
				label="Handle or DID identifier"
				placeholder="paul.bsky.social"
				value={identifier()}
				required
				pattern={/* @once */ DID_OR_HANDLE_RE.source}
				autofocus={isActive()}
				onChange={setIdentifier}
			/>

			<div
				hidden={status() === undefined}
				class="whitespace-pre-wrap text-[0.8125rem] font-medium leading-5 text-gray-500"
			>
				{status()}
			</div>

			<StageErrorView error={error()} />

			<StageActions hidden={!isActive()}>
				<StageActions.Divider />
				<Button type="submit">Next</Button>
			</StageActions>
		</Stage>
	);
};

export default Step1_HandleInput;
