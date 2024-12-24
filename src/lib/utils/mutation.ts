import { createSignal } from 'solid-js';
import { makeAbortable } from './abortable';

export interface SuccessMutationState<D, V> {
	data: D;
	error: undefined;
	variables: V;
	isSuccess: true;
	isError: false;
	isPending: false;
	isIdle: false;
}

export interface ErrorMutationState<V> {
	data: undefined;
	error: unknown;
	variables: V;
	isSuccess: false;
	isError: true;
	isPending: false;
	isIdle: false;
}

export interface PendingMutationState<V> {
	data: undefined;
	error: undefined;
	variables: V;
	isSuccess: false;
	isError: false;
	isPending: true;
	isIdle: false;
}

export interface IdleMutationState {
	data: undefined;
	error: undefined;
	variables: undefined;
	isSuccess: false;
	isError: false;
	isPending: false;
	isIdle: true;
}

export type MutationReturn<D, V> = (
	| IdleMutationState
	| PendingMutationState<V>
	| SuccessMutationState<D, V>
	| ErrorMutationState<V>
) & {
	mutate(variables: V): void;
	mutateAsync(variables: V): Promise<D>;
};

type MutationFunction<D = unknown, V = unknown> = (variables: V, signal: AbortSignal) => Promise<D>;

export interface MutationOptions<D = unknown, V = unknown> {
	mutationFn: MutationFunction<D, V>;
	onMutate?: (variables: V) => void;
	onSuccess?: (data: NoInfer<D>, variables: NoInfer<V>) => void;
	onError?: (error: unknown, variables: NoInfer<V>) => void;
	onSettled?: (data: NoInfer<D> | undefined, error: unknown, variables: NoInfer<V>) => void;
}

const enum MutationState {
	IDLE,
	PENDING,
	SUCCESS,
	ERROR,
}

export const createMutation = <D, V = void>(options: MutationOptions<D, V>): MutationReturn<D, V> => {
	const [getSignal, cleanup] = makeAbortable();
	const [state, setState] = createSignal<{ s: MutationState; v?: any; d?: any; e?: any }>(
		{ s: MutationState.IDLE },
		{ equals: (prev, next) => prev.s === next.s },
	);

	const mutate = async (variables: V): Promise<D> => {
		const signal = getSignal();

		setState({ s: MutationState.PENDING, v: variables });

		try {
			options.onMutate?.(variables);

			const data = await options.mutationFn(variables, signal);

			if (!signal.aborted) {
				options.onSuccess?.(data, variables);
				options.onSettled?.(data, undefined, variables);

				setState({ s: MutationState.SUCCESS, v: variables, d: data });
			}

			return data;
		} catch (err) {
			if (!signal.aborted) {
				options.onError?.(err, variables);
				options.onSettled?.(undefined, err, variables);

				setState({ s: MutationState.ERROR, v: variables, e: err });
			}

			throw err;
		} finally {
			if (!signal.aborted) {
				cleanup();
			}
		}
	};

	return {
		get data() {
			const $state = state();
			if ($state.s === MutationState.SUCCESS) {
				return $state.d;
			}
		},
		get error() {
			const $state = state();
			if ($state.s === MutationState.ERROR) {
				return $state.e;
			}
		},
		get variables() {
			return state().v;
		},
		get isSuccess() {
			return state().s === MutationState.SUCCESS;
		},
		get isError() {
			return state().s === MutationState.ERROR;
		},
		get isPending() {
			return state().s === MutationState.PENDING;
		},
		get isIdle() {
			return state().s === MutationState.IDLE;
		},
		mutateAsync: mutate,
		mutate: (variables: V) => mutate(variables).then(noop, noop),
	} as any;
};

const noop = () => {};
