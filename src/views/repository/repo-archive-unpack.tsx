import { FileSystemWritableFileStream, showSaveFilePicker } from 'native-file-system-adapter';
import { createSignal } from 'solid-js';

import { RepoReader } from '@atcute/car/v4';
import { writeTarEntry } from '@mary/tar';

import { createDropZone } from '~/lib/hooks/dropzone';
import { useTitle } from '~/lib/navigation/router';
import { makeAbortable } from '~/lib/utils/abortable';

import Logger, { createLogger } from '~/components/logger';

// @ts-expect-error: new API
const yieldToScheduler: () => Promise<void> = window?.scheduler?.yield
	? // @ts-expect-error: whatever
		window.scheduler.yield.bind(window.scheduler)
	: undefined;

const yieldToIdle =
	typeof requestIdleCallback === 'function'
		? () => new Promise((resolve) => requestIdleCallback(resolve))
		: () => new Promise((resolve) => setTimeout(resolve, 1));

const UnpackCarPage = () => {
	const logger = createLogger();

	const [getSignal, cleanup] = makeAbortable();
	const [pending, setPending] = createSignal(false);

	const { ref: dropRef, isDropping } = createDropZone({
		// Checked, the mime type for CAR files is blank.
		dataTypes: [''],
		multiple: false,
		onDrop(files) {
			if (files) {
				onFileDrop(files);
			}
		},
	});

	const mutate = async (file: File, signal: AbortSignal) => {
		logger.log(`Starting extraction`);

		const stream = file.stream();
		await using repo = RepoReader.fromStream(stream);

		let count = 0;

		let writable: FileSystemWritableFileStream | undefined;

		using progress = logger.progress(`Unpacking records (${count} entries)`);

		for await (const { collection, rkey, record } of repo) {
			if (writable === undefined) {
				using _progress = logger.progress(`Waiting for the user`);

				const fd = await showSaveFilePicker({
					suggestedName: `${file.name.replace(/\.car$/, '')}.tar`,

					// @ts-expect-error: ponyfill doesn't have the full typings
					id: 'car-unpack',
					startIn: 'downloads',
					types: [
						{
							description: 'Tarball archive',
							accept: { 'application/tar': ['.tar'] },
						},
					],
				}).catch((err) => {
					console.warn(err);

					if (err instanceof DOMException && err.name === 'AbortError') {
						logger.warn(`Opened the file picker, but it was aborted`);
					} else {
						logger.warn(`Something went wrong when opening the file picker`);
					}

					return undefined;
				});

				writable = await fd?.createWritable();

				if (writable === undefined) {
					// We already handled the errors above
					return;
				}
			}

			signal.throwIfAborted();

			const entry = writeTarEntry({
				filename: `${collection}/${filenamify(rkey)}.json`,
				data: JSON.stringify(record, null, 2),
			});

			progress.update(`Unpacking records (${count} entries)`);
			writable.write(entry);
			count++;

			if (yieldToScheduler !== undefined) {
				await yieldToScheduler();
			}
		}

		signal.throwIfAborted();

		if (writable === undefined) {
			// If we got here it means the above loop never iterated
			logger.log(`CAR file has no records`);
		} else {
			logger.log(`${count} records extracted`);

			{
				using _progress = logger.progress(`Flushing writes`);
				await writable.close();
			}

			logger.log(`Finished!`);
		}
	};

	const onFileDrop = (files: File[]) => {
		if (pending() || files.length < 1) {
			return;
		}

		const signal = getSignal();

		setPending(true);
		mutate(files[0], signal).then(
			() => {
				if (signal.aborted) {
					return;
				}

				cleanup();
				setPending(false);
			},
			(err) => {
				if (signal.aborted) {
					return;
				}

				cleanup();
				setPending(false);

				console.error(err);
				logger.error(`Critical error: ${err}\nFile might be malformed, or might not be a CAR archive`);
			},
		);
	};

	useTitle(() => `Unpack archive — boat`);

	return (
		<>
			<div class="p-4">
				<h1 class="text-lg font-bold text-purple-800">Unpack archive</h1>
				<p class="text-gray-600">Extract a repository archive into a tarball</p>
			</div>
			<hr class="mx-4 border-gray-300" />

			<div class="p-4">
				<fieldset
					ref={dropRef}
					disabled={pending()}
					class={
						`grid place-items-center rounded border border-gray-300 px-6 py-12 disabled:opacity-50` +
						(pending() || !isDropping() ? ` bg-gray-100` : ` bg-green-100`)
					}
				>
					<div class="flex flex-col items-center gap-4">
						<button
							onClick={() => {
								const input = document.createElement('input');
								input.type = 'file';
								input.accept = '.car,application/vnd.ipld.car';
								input.oninput = () => onFileDrop(Array.from(input.files!));

								input.click();
							}}
							class="flex h-9 select-none items-center rounded border border-gray-400 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-200 active:bg-gray-200 disabled:pointer-events-none"
						>
							Browse files
						</button>
						<p class="select-none font-medium text-gray-600">or drop your file here</p>
					</div>
				</fieldset>
			</div>
			<hr class="mx-4 border-gray-300" />

			<Logger logger={logger} />
		</>
	);
};

export default UnpackCarPage;

const INVALID_CHAR_RE = /[<>:"/\\|?*\x00-\x1F]/g;
const filenamify = (name: string) => {
	return name.replace(INVALID_CHAR_RE, '~');
};
