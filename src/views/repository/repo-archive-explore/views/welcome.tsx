import { Show } from 'solid-js';

import type { MutationReturn } from '~/lib/utils/mutation';

import CircularProgress from '~/components/circular-progress';
import FileDropZone from '~/components/file-drop-zone';
import PageHeader from '~/components/page-header';

import type { Archive } from '../types';

interface WelcomeViewProps {
	mutation: MutationReturn<Archive, { file: File }>;
}

const WelcomeView = ({ mutation }: WelcomeViewProps) => {
	return (
		<>
			<PageHeader title="Explore archive" subtitle="Explore a repository archive" />

			<div class="flex flex-col gap-4 p-4">
				<FileDropZone
					accept=".car,application/vnd.ipld.car"
					dataTypes={['']}
					onFiles={(files) => mutation.mutate({ file: files[0] })}
				>
					<div
						hidden={!mutation.isPending}
						class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-50"
					>
						<CircularProgress />
						<span class="font-medium">Reading CAR file</span>
					</div>
				</FileDropZone>

				<Show when={mutation.error}>
					<p class="whitespace-pre-wrap text-[0.8125rem] font-medium leading-5 text-red-800">
						{'' + mutation.error}
					</p>
				</Show>
			</div>
		</>
	);
};

export default WelcomeView;
