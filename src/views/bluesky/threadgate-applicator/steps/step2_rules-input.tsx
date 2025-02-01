import { batch, createMemo, createSignal, For, Show } from 'solid-js';

import { AppBskyFeedThreadgate, Brand } from '@atcute/client/lexicons';

import { UnwrapArray } from '~/api/utils/types';

import { appViewRpc } from '~/globals/rpc';

import { createDerivedSignal } from '~/lib/hooks/derived-signal';
import { dequal } from '~/lib/utils/dequal';
import { createQuery } from '~/lib/utils/query';

import RadioInput from '~/components/inputs/radio-input';
import { Stage, StageActions, WizardStepProps } from '~/components/wizard';

import CircularProgressView from '~/components/circular-progress-view';
import Button from '~/components/inputs/button';
import ToggleInput from '~/components/inputs/toggle-input';

import { ThreadgateApplicatorConstraints } from '../page';
import { sortThreadgateAllow } from '../utils';

const enum FilterType {
	ALL = 'all',
	MISSING_ONLY = 'missing_only',
}

const enum ThreadRulePreset {
	EVERYONE = 'everyone',
	NO_ONE = 'no_one',
	CUSTOM = 'custom',
}

type ThreadRule = UnwrapArray<AppBskyFeedThreadgate.Record['allow']>;

const Step2_RulesInput = ({
	data,
	isActive,
	onPrevious,
	onNext,
}: WizardStepProps<ThreadgateApplicatorConstraints, 'Step2_RulesInput'>) => {
	const [filter, setFilter] = createSignal(FilterType.MISSING_ONLY);

	const [threadRules, _setThreadRules] = createSignal<ThreadRule[] | undefined>([
		{ $type: 'app.bsky.feed.threadgate#followingRule' },
		{ $type: 'app.bsky.feed.threadgate#mentionRule' },
	]);

	const [threadRulesPreset, setThreadRulesPreset] = createDerivedSignal(() => {
		const rules = threadRules();

		if (rules === undefined) {
			return ThreadRulePreset.EVERYONE;
		}

		if (rules.length === 0) {
			return ThreadRulePreset.NO_ONE;
		}

		return ThreadRulePreset.CUSTOM;
	});

	const lists = createQuery(
		() => data.profile.didDoc.id,
		async (did, signal) => {
			const lists = await accumulate(async (cursor) => {
				const { data } = await appViewRpc.get('app.bsky.graph.getLists', {
					signal,
					params: {
						actor: did,
						cursor,
						limit: 100,
					},
				});

				return {
					cursor: data.cursor,
					items: data.lists,
				};
			});

			const collator = new Intl.Collator('en');

			return lists
				.filter((list) => list.purpose === 'app.bsky.graph.defs#curatelist')
				.sort((a, b) => collator.compare(a.name, b.name));
		},
	);

	const filteredThreads = createMemo(() => {
		const $threads = data.threads;
		const $threadRules = threadRules();

		// It's fine, let's just mutate the original array.
		sortThreadgateAllow($threadRules);

		switch (filter()) {
			case FilterType.ALL: {
				return $threads.filter(({ threadgate }) => !dequal(threadgate?.allow, $threadRules));
			}
			case FilterType.MISSING_ONLY: {
				if ($threadRules === undefined) {
					return [];
				}

				return $threads.filter(({ threadgate }) => threadgate === null);
			}
		}
	});

	const isDisabled = createMemo(() => {
		const $threads = filteredThreads();

		const $threadRulesPreset = threadRulesPreset();
		const $threadRules = threadRules();

		return (
			$threads.length === 0 ||
			($threadRulesPreset === ThreadRulePreset.CUSTOM &&
				($threadRules === undefined || $threadRules.length === 0))
		);
	});

	const hasThreadRule = (predicate: ThreadRule): boolean => {
		return !!threadRules()?.find((rule) => dequal(rule, predicate));
	};

	const setCustomThreadRules = (next: ThreadRule[] | undefined) => {
		batch(() => {
			_setThreadRules(next);
			setThreadRulesPreset(ThreadRulePreset.CUSTOM);
		});
	};

	return (
		<Stage
			title="Configure thread gating options"
			onSubmit={() => {
				onNext('Step3_Authentication', {
					profile: data.profile,
					threads: filteredThreads(),
					rules: threadRules(),
				});
			}}
		>
			<RadioInput
				label="Who can reply..."
				value={threadRulesPreset()}
				required
				options={[
					{ value: ThreadRulePreset.EVERYONE, label: `everyone can reply` },
					{ value: ThreadRulePreset.NO_ONE, label: `no one can reply` },
					{ value: ThreadRulePreset.CUSTOM, label: `custom` },
				]}
				onChange={(next) => {
					switch (next) {
						case ThreadRulePreset.CUSTOM: {
							setCustomThreadRules([]);
							break;
						}
						case ThreadRulePreset.EVERYONE: {
							_setThreadRules(undefined);
							break;
						}
						case ThreadRulePreset.NO_ONE: {
							_setThreadRules([]);
							break;
						}
					}
				}}
			/>

			<p class="text-[0.8125rem] font-medium">Alternatively, combine these options:</p>

			<fieldset class="flex flex-col gap-2">
				<legend class="contents">
					<span class="font-semibold text-gray-600">Allow replies from...</span>
				</legend>

				<ToggleInput
					label="followed users"
					checked={hasThreadRule({ $type: 'app.bsky.feed.threadgate#followingRule' })}
					onChange={(next) => {
						if (next) {
							setCustomThreadRules([
								...(threadRules() ?? []),
								{ $type: 'app.bsky.feed.threadgate#followingRule' },
							]);
						} else {
							setCustomThreadRules(
								threadRules()?.filter((rule) => rule.$type !== 'app.bsky.feed.threadgate#followingRule'),
							);
						}
					}}
				/>

				<ToggleInput
					label="users mentioned in the post"
					checked={hasThreadRule({ $type: 'app.bsky.feed.threadgate#mentionRule' })}
					onChange={(next) => {
						if (next) {
							setCustomThreadRules([
								...(threadRules() ?? []),
								{ $type: 'app.bsky.feed.threadgate#mentionRule' },
							]);
						} else {
							setCustomThreadRules(
								threadRules()?.filter((rule) => rule.$type !== 'app.bsky.feed.threadgate#mentionRule'),
							);
						}
					}}
				/>
			</fieldset>

			<fieldset class="flex flex-col gap-2">
				<legend class="contents">
					<span class="font-semibold text-gray-600">Allow replies from users in...</span>
				</legend>

				<For
					each={lists.data}
					fallback={
						<Show when={!lists.isPending} fallback={<CircularProgressView />}>
							<p class="text-gray-500">You don't have any user lists created</p>
						</Show>
					}
				>
					{(list) => {
						const rule: Brand.Union<AppBskyFeedThreadgate.ListRule> = {
							$type: 'app.bsky.feed.threadgate#listRule',
							list: list.uri,
						};

						return (
							<ToggleInput
								label={/* @once */ list.name}
								checked={hasThreadRule(rule)}
								onChange={(next) => {
									if (next) {
										setCustomThreadRules([...(threadRules() ?? []), rule]);
									} else {
										setCustomThreadRules(threadRules()?.filter((r) => !dequal(r, rule)));
									}
								}}
							/>
						);
					}}
				</For>
			</fieldset>

			<hr />

			<RadioInput
				label="Apply to..."
				blurb={
					<>
						<span>This will apply to {filteredThreads().length} threads. </span>
						{/* <button
							type="button"
							hidden={filteredThreads().length < 1}
							class="font-medium text-purple-800 hover:underline"
						>
							View
						</button> */}
					</>
				}
				value={filter()}
				required
				options={[
					{ value: FilterType.ALL, label: `all threads` },
					{ value: FilterType.MISSING_ONLY, label: `threads that are not gated` },
				]}
				onChange={setFilter}
			/>

			<StageActions hidden={!isActive()}>
				<StageActions.Divider />

				<Button variant="secondary" onClick={onPrevious}>
					Previous
				</Button>
				<Button type="submit" disabled={isDisabled()}>
					Next
				</Button>
			</StageActions>
		</Stage>
	);
};

export default Step2_RulesInput;

interface AccumulateResponse<T> {
	cursor?: string;
	items: T[];
}

type AccumulateFetcher<T> = (cursor: string | undefined) => Promise<AccumulateResponse<T>>;

const accumulate = async <T,>(fn: AccumulateFetcher<T>, limit = 100): Promise<T[]> => {
	let cursor: string | undefined;
	let acc: T[] = [];

	for (let i = 0; i < limit; i++) {
		const res = await fn(cursor);
		cursor = res.cursor;
		acc = acc.concat(res.items);
		if (!cursor) {
			break;
		}
	}

	return acc;
};
