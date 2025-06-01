import { Match, Switch } from 'solid-js';

import { RepoReader } from '@atcute/car/v4';

import { createMutation } from '~/lib/utils/mutation';

import type { Archive, RecordEntry } from './types';
import ExploreView from './views/explore';
import WelcomeView from './views/welcome';

const ArchiveExplorePage = () => {
	const mutation = createMutation({
		async mutationFn({ file }: { file: File }): Promise<Archive> {
			const stream = file.stream();
			await using repo = RepoReader.fromStream(stream);

			const collections = new Map<string, RecordEntry[]>();
			const archive: Archive = {
				file: file,
				entries: [],
			};

			for await (const entry of repo) {
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
		onError(err) {
			console.error(err);
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
