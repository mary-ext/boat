import ChevronRightIcon from '~/components/ic-icons/baseline-chevron-right';

import type { Archive, View } from '../../types';

interface RepoSubviewProps {
	archive: Archive;
	onRoute: (view: View) => void;
}

const RepoSubview = ({ archive, onRoute }: RepoSubviewProps) => {
	return (
		<div class="px-2 pb-4 pt-0">
			<ul>
				{archive.entries.map((entry) => {
					const hasSingleEntry = entry.entries.length === 1;

					return (
						<li>
							<button
								onClick={() => {
									if (hasSingleEntry) {
										onRoute({ type: 'record', collection: entry, record: entry.entries[0] });
									} else {
										onRoute({ type: 'collection', collection: entry });
									}
								}}
								class="flex max-w-full flex-wrap items-center gap-0.5 rounded p-1.5 font-mono hover:bg-gray-200"
							>
								<span
									class={`truncate font-medium` + (hasSingleEntry ? ` text-gray-700` : ` text-purple-700`)}
								>
									{/* @once */ entry.name}
								</span>

								{hasSingleEntry && (
									<>
										<ChevronRightIcon class="shrink-0 text-base text-gray-500" />
										<span class="truncate font-medium text-purple-700">{entry.entries[0].key}</span>
									</>
								)}
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
};

export default RepoSubview;
