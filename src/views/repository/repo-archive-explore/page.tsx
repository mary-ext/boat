import { Match, Switch } from 'solid-js';

import { iterateAtpRepo } from '@atcute/car';

import { createMutation } from '~/lib/utils/mutation';

import WelcomeView from './views/welcome';

import { Archive, RecordEntry } from './types';
import ExploreView from './views/explore';

const ArchiveExplorePage = () => {
	const mutation = createMutation({
		async mutationFn({ file }: { file: File }): Promise<Archive> {
			const buffer = new Uint8Array(await file.arrayBuffer());

			const collections = new Map<string, RecordEntry[]>();
			const archive: Archive = {
				file: file,
				entries: [],
			};

			for (const entry of iterateAtpRepo(buffer)) {
				let list = collections.get(entry.collection);
				if (list === undefined) {
					collections.set(entry.collection, (list = []));
					archive.entries.push({
						name: entry.collection,
						entries: list,
					});
				}

				const carEntry = entry.carEntry;

				list.push({
					key: entry.rkey,
					cid: entry.cid.$link,
					dataStart: carEntry.bytesStart,
					dataEnd: carEntry.bytesEnd,
				});
			}

			return archive;
		},
	});

	return (
		<>
			<Switch>
				<Match when={mutation.data} keyed>
					{(archive) => <ExploreView archive={archive} onClose={mutation.reset} />}
				</Match>

				<Match when>
					<WelcomeView mutation={mutation} />
				</Match>
			</Switch>
		</>
	);
};

export default ArchiveExplorePage;
