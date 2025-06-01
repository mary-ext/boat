import { Show } from 'solid-js';

import type { MutationReturn } from '~/lib/utils/mutation';

import CircularProgress from '~/components/circular-progress';
import { createDropZone } from '~/lib/hooks/dropzone';

import type { Archive } from '../types';

interface WelcomeViewProps {
	mutation: MutationReturn<Archive, { file: File }>;
}

const WelcomeView = ({ mutation }: WelcomeViewProps) => {
	const { ref: dropRef, isDropping } = createDropZone({
		// Checked, the mime type for CAR files is blank.
		dataTypes: [''],
		multiple: false,
		onDrop(files) {
			if (files) {
				mutation.mutate({ file: files[0] });
			}
		},
	});

	return (
		<>
			<div class="p-4">
				<h1 class="text-lg font-bold text-purple-800">Explore archive</h1>
				<p class="text-gray-600">Explore a repository archive</p>
			</div>
			<hr class="mx-4 border-gray-300" />

			<div class="flex flex-col gap-4 p-4">
				<fieldset
					ref={dropRef}
					class={
						`grid place-items-center rounded border border-gray-300 px-6 py-12 disabled:opacity-50` +
						(!isDropping() ? ` bg-gray-100` : ` bg-green-100`)
					}
				>
					<div class="flex flex-col items-center gap-4">
						<button
							onClick={() => {
								const input = document.createElement('input');
								input.type = 'file';
								input.accept = '.car,application/vnd.ipld.car';
								input.oninput = () => mutation.mutate({ file: input.files![0] });

								input.click();
							}}
							class="flex h-9 select-none items-center rounded border border-gray-400 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-200 active:bg-gray-200 disabled:pointer-events-none"
						>
							Browse files
						</button>
						<p class="select-none font-medium text-gray-600">or drop your file here</p>
					</div>

					<div
						hidden={!mutation.isPending}
						class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-50"
					>
						<CircularProgress />
						<span class="font-medium">Reading CAR file</span>
					</div>
				</fieldset>

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
