import { createSignal, Match, Show, Switch } from 'solid-js';

import ChevronRightIcon from '~/components/ic-icons/baseline-chevron-right';
import ArchiveOutlinedIcon from '~/components/ic-icons/outline-archive';

import type { Archive, View } from '../types';

import CloseIcon from '~/components/ic-icons/baseline-close';
import CollectionSubview from './explore/collection';
import RecordSubview from './explore/record';
import RepoSubview from './explore/repo';

export interface ExploreViewProps {
	archive: Archive;
	onClose: () => void;
}

const ExploreView = ({ archive, onClose }: ExploreViewProps) => {
	const [view, setView] = createSignal<View>({ type: 'repo' });

	return (
		<>
			<div class="flex items-start justify-between gap-1 p-2">
				<div class="flex flex-wrap items-center">
					<button
						type="button"
						title="This repository"
						disabled={view().type === 'repo'}
						onClick={() => {
							setView({ type: 'repo' });
						}}
						class="grid shrink-0 place-items-center rounded p-1.5 text-xl text-purple-700 hover:bg-gray-200 disabled:pointer-events-none disabled:text-black"
					>
						<ArchiveOutlinedIcon />
					</button>

					<Show
						when={(() => {
							const $view = view();
							switch ($view.type) {
								case 'collection':
								case 'record': {
									return $view.collection;
								}
							}
						})()}
					>
						{(collection) => (
							<>
								<ChevronRightIcon class="shrink-0 text-base text-gray-500" />
								<button
									type="button"
									disabled={view().type === 'collection'}
									onClick={() => {
										setView({ type: 'collection', collection: collection() });
									}}
									class="truncate rounded p-1.5 font-mono font-medium text-purple-700 hover:bg-gray-200 disabled:pointer-events-none disabled:text-black"
								>
									{collection().name}
								</button>
							</>
						)}
					</Show>

					<Show
						when={(() => {
							const $view = view();
							switch ($view.type) {
								case 'record': {
									return $view.record;
								}
							}
						})()}
					>
						{(record) => (
							<>
								<ChevronRightIcon class="shrink-0 text-base text-gray-500" />
								<button
									type="button"
									disabled={view().type === 'record'}
									class="truncate rounded p-1.5 font-mono font-medium text-purple-700 hover:bg-gray-200 disabled:pointer-events-none disabled:text-black"
								>
									{record().key}
								</button>
							</>
						)}
					</Show>
				</div>

				<div class="grow"></div>

				<button
					type="button"
					onClick={onClose}
					class="grid shrink-0 place-items-center rounded p-1.5 text-xl hover:bg-gray-200"
				>
					<CloseIcon />
				</button>
			</div>

			<Switch>
				<Match when={view().type === 'repo'}>
					<RepoSubview archive={archive} onRoute={setView} />
				</Match>

				<Match
					when={(() => {
						const $view = view();
						if ($view.type === 'collection') {
							return $view;
						}
					})()}
					keyed
				>
					{({ collection }) => <CollectionSubview collection={collection} onRoute={setView} />}
				</Match>

				<Match
					when={(() => {
						const $view = view();
						if ($view.type === 'record') {
							return $view;
						}
					})()}
					keyed
				>
					{({ record }) => <RecordSubview archive={archive} record={record} />}
				</Match>
			</Switch>
		</>
	);
};

export default ExploreView;
