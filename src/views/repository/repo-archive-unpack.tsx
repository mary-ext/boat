import { FileSystemWritableFileStream, showSaveFilePicker } from 'native-file-system-adapter';
import { createSignal } from 'solid-js';

import { fromStream } from '@atcute/repo';
import { writeTarEntry } from '@mary/tar';

import { useTitle } from '~/lib/navigation/router';
import { makeAbortable } from '~/lib/utils/abortable';

import FileDropZone from '~/components/file-drop-zone';
import Logger, { createLogger } from '~/components/logger';
import PageHeader from '~/components/page-header';

// @ts-expect-error: new API
const yieldToScheduler: () => Promise<void> = window?.scheduler?.yield
	? // @ts-expect-error: whatever
		window.scheduler.yield.bind(window.scheduler)
	: undefined;

const UnpackCarPage = () => {
	const logger = createLogger();

	const [getSignal, cleanup] = makeAbortable();
	const [pending, setPending] = createSignal(false);

	const mutate = async (file: File, signal: AbortSignal) => {
		logger.log(`Starting extraction`);

		const stream = file.stream();
		await using repo = fromStream(stream);

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

			count++;

			if (count % 100 !== 0) {
				writable.write(entry);
			} else {
				await writable.write(entry);
			}

			progress.update(`Unpacking records (${count} entries)`);

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
			<PageHeader title="Unpack archive" subtitle="Extract a repository archive into a tarball" />

			<div class="p-4">
				<FileDropZone
					accept=".car,application/vnd.ipld.car"
					dataTypes={['']}
					disabled={pending()}
					onFiles={onFileDrop}
				/>
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
