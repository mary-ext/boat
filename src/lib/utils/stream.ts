export async function* iterateStream<T>(stream: ReadableStream<T>) {
	const reader = stream.getReader();

	try {
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				return;
			}

			yield value;
		}
	} finally {
		reader.releaseLock();
	}
}
