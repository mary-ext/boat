import { type Accessor, type Signal, createMemo, createSignal } from 'solid-js';

export const createDerivedSignal = <T>(accessor: Accessor<T>): Signal<T> => {
	const computable = createMemo(() => createSignal(accessor()));

	// @ts-expect-error
	return [() => computable()[0](), (next) => computable()[1](next)] as Signal<T>;
};
