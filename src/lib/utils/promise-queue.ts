import Queue from '@mary/ds-queue';

interface QueueTask {
	deferred: PromiseWithResolvers<any>;
	fn: () => any;
}

export class PromiseQueue {
	#queue = new Queue<QueueTask>();

	#max: number;
	#current = 0;

	constructor({ max = 2 }: { max?: number } = {}) {
		this.#max = max;
	}

	add<T>(fn: () => Promise<T>): Promise<T> {
		const deferred = Promise.withResolvers<T>();

		this.#queue.enqueue({ deferred, fn });
		this.#run();

		return deferred.promise;
	}

	async flush(): Promise<void> {
		while (this.#queue.size > 0) {
			// type assertion here because JSR omits the [Symbol.iterator] method declaration
			await Promise.all(
				Array.from(this.#queue as any as Iterable<QueueTask>, (task) => task.deferred.promise),
			);
		}
	}

	#run() {
		let task: QueueTask | undefined;

		if (this.#current <= this.#max && (task = this.#queue.dequeue()) !== undefined) {
			const { deferred, fn } = task;
			this.#current++;

			const promise = new Promise((r) => r(fn()));

			const done = () => {
				this.#current--;
				this.#run();
			};

			promise.then(
				(res) => {
					done();
					deferred.resolve(res);
				},
				(err) => {
					done();
					deferred.reject(err);
				},
			);
		}
	}
}
