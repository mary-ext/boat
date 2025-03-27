import * as TID from '@atcute/tid';

import type { CollectionEntry, View } from '../../types';

interface CollectionSubviewProps {
	collection: CollectionEntry;
	onRoute: (view: View) => void;
}

const CollectionSubview = ({ collection, onRoute }: CollectionSubviewProps) => {
	return (
		<div class="px-2 pb-4 pt-0">
			<ul>
				{collection.entries.map((entry) => {
					const isTid = TID.validate(entry.key);

					return (
						<li class="flex items-center justify-between gap-1">
							<button
								onClick={() => {
									onRoute({ type: 'record', collection, record: entry });
								}}
								class="flex min-w-0 flex-wrap items-center gap-0.5 rounded p-1.5 font-mono hover:bg-gray-200"
							>
								<span class="truncate font-medium text-purple-700">{/* @once */ entry.key}</span>
							</button>

							{isTid && (
								<span class="p-1.5 font-mono text-xs text-gray-600">
									{/* @once */ new Date(TID.parse(entry.key).timestamp / 1_000).toISOString()}
								</span>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
};

export default CollectionSubview;
