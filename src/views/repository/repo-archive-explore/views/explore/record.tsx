import { Match, Switch } from 'solid-js';

import * as CBOR from '@atcute/cbor';

import { createQuery } from '~/lib/utils/query';

import type { Archive, RecordEntry } from '../../types';

interface RecordSubviewProps {
	archive: Archive;
	record: RecordEntry;
}

const RecordSubview = ({ archive, record }: RecordSubviewProps) => {
	const query = createQuery(
		() => record,
		async (_record, signal) => {
			const stream = archive.file.stream();

			const raw = await readStreamRange(stream, record.dataStart, record.dataEnd, signal);
			const decoded = CBOR.decode(raw);

			return { raw, decoded };
		},
	);

	return (
		<Switch>
			<Match when={query.data} keyed>
				{({ decoded }) => {
					return (
						<div class="flex grow flex-col">
							<textarea
								readonly
								value={JSON.stringify(decoded, null, 2)}
								class="grow resize-none border-0 px-4 pb-4 pt-2 font-mono text-sm"
							/>
						</div>
					);
				}}
			</Match>
		</Switch>
	);
};

export default RecordSubview;

const readStreamRange = async (
	stream: ReadableStream<Uint8Array>,
	start: number,
	end: number,
	signal?: AbortSignal,
): Promise<Uint8Array> => {
	if (start < 0) {
		throw new RangeError(`invalid start position: ${start}`);
	}
	if (end <= start) {
		throw new RangeError(`invalid end position: ${end}`);
	}

	const length = end - start;
	const result = new Uint8Array(length);

	let read = 0;
	let written = 0;

	for await (const chunk of createStreamIterator(stream)) {
		signal?.throwIfAborted();

		if (read + chunk.length <= start) {
			read += chunk.length;
			continue;
		}

		const offset = Math.max(0, start - read);
		const toRead = Math.min(chunk.length - offset, length - written);

		result.set(chunk.subarray(offset, offset + toRead), written);

		written += toRead;
		read += chunk.length;

		if (written >= length) {
			break;
		}
	}

	return result;
};

const createStreamIterator: <T>(stream: ReadableStream<T>) => AsyncIterableIterator<T> =
	Symbol.asyncIterator in ReadableStream.prototype
		? // @ts-expect-error
			(stream) => stream[Symbol.asyncIterator]()
		: (stream) => {
				const reader = stream.getReader();

				return {
					[Symbol.asyncIterator]() {
						return this;
					},
					next() {
						return reader.read() as Promise<IteratorResult<any>>;
					},
					async return() {
						await reader.cancel();
						return { done: true, value: undefined };
					},
					async throw(error: unknown) {
						await reader.cancel(error);
						return { done: true, value: undefined };
					},
				};
			};
