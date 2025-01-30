import { batch, createSignal } from 'solid-js';

import { At } from '@atcute/client/lexicons';

import { DID_OR_HANDLE_RE, DID_RE, HANDLE_RE } from '~/api/utils/strings';
import { UnwrapArray } from '~/api/utils/types';

export interface ParamParser<T> {
	parse: (value: string | string[] | null) => T | null;
	serialize: (value: T) => string | string[] | null;
}

export interface BuiltParamParser<T> extends ParamParser<T> {
	equals(a: T, b: T): boolean;
	withDefault(value: NonNullable<T>): BuiltParamParser<T> & { readonly defaultValue: NonNullable<T> };
}

type Nullable<T> = {
	[K in keyof T]: T[K] | null;
};

type Prettify<T> = {
	[K in keyof T]: T[K];
} & {};

export type ParamParserWithDefault<T> = ParamParser<T> & { defaultValue?: T };

export type ParamParserMap<Map = any> = {
	[Key in keyof Map]: ParamParserWithDefault<Map[Key]>;
};

export type ParamValues<T extends ParamParserMap> = Prettify<{
	[K in keyof T]: T[K]['defaultValue'] extends NonNullable<ReturnType<T[K]['parse']>>
		? NonNullable<ReturnType<T[K]['parse']>>
		: ReturnType<T[K]['parse']> | null;
}>;

export type SetParamValues<M extends ParamParserMap> = (
	values: Partial<Nullable<ParamValues<M>>> | null,
) => void;

export type UseSearchParamsReturn<M extends ParamParserMap> = [ParamValues<M>, SetParamValues<M>];

export const useSearchParams = <M extends ParamParserMap>(map: M): UseSearchParamsReturn<M> => {
	let searchParams = new URLSearchParams(location.search);
	let mappedSearchParams: ParamValues<M>;

	{
		const mapped: any = {};

		for (const key in map) {
			const parser = map[key];

			let rawValue = null;
			if (searchParams.has(key)) {
				rawValue = searchParams.getAll(key);

				if (rawValue.length === 1) {
					rawValue = rawValue[0];
				}
			}

			let value = parser.parse(rawValue);
			if (value === null && 'defaultValue' in parser) {
				value = parser.defaultValue;
			}

			mapped[key] = value;
		}

		mappedSearchParams = createStateObject(mapped);
	}

	const update = () => {
		const search = searchParams.toString();
		const path = location.pathname + (search ? '?' + search : '') + location.hash;

		history.replaceState(history.state, '', path);
	};

	const setParams: SetParamValues<M> = (values: any) => {
		return batch(() => {
			if (values === null) {
				for (const key in map) {
					const parser = map[key];

					mappedSearchParams[key] = parser.defaultValue ?? null;
					searchParams.delete(key);
				}

				update();
				return;
			}

			for (const key in values) {
				const parser = map[key];
				if (!parser) {
					continue;
				}

				const value = values[key];
				if (value === undefined) {
					continue;
				}

				const serialized = value !== null ? parser.serialize(value) : null;
				if (serialized !== null) {
					// @ts-expect-error
					mappedSearchParams[key] = value;

					if (Array.isArray(serialized)) {
						for (let idx = 0, len = serialized.length; idx < len; idx++) {
							if (idx === 0) {
								searchParams.set(key, serialized[idx]);
							} else {
								searchParams.append(key, serialized[idx]);
							}
						}
					} else {
						searchParams.set(key, serialized);
					}
				} else {
					// @ts-expect-error
					mappedSearchParams[key] = parser.defaultValue ?? null;
					searchParams.delete(key);
				}
			}

			update();
		});
	};

	return [mappedSearchParams, setParams];
};

const createStateObject = <T extends Record<string, any>>(obj: T): T => {
	const state = {} as T;

	for (const key in obj) {
		const [value, setValue] = createSignal(obj[key]);

		Object.defineProperty(state, key, {
			get: value,
			set: (next) => setValue(typeof next === 'function' ? () => next : next),
		});
	}

	return state;
};

/*#__NO_SIDE_EFFECTS__*/
const createParser = <T>(parser: ParamParser<T>): BuiltParamParser<T> => {
	return {
		...parser,
		equals(a, b) {
			return a === b;
		},
		withDefault(value) {
			return { ...this, defaultValue: value };
		},
	};
};

export const asString = createParser({
	parse(value) {
		if (typeof value === 'string') {
			return value;
		}

		return null;
	},
	serialize(value) {
		return value;
	},
});

export const asStringUnion = <const T extends [string, ...string[]][]>(values: T) => {
	return createParser({
		parse(value) {
			if (typeof value === 'string' && values.includes(value as UnwrapArray<T>)) {
				return value;
			}

			return null;
		},
		serialize(value) {
			return value;
		},
	});
};

export const asInteger = createParser({
	parse(value) {
		if (typeof value === 'string') {
			const num = +value;
			if (Number.isSafeInteger(num) && num >= 0) {
				return num;
			}
		}

		return null;
	},
	serialize(value) {
		return '' + value;
	},
});

export const asBoolean = createParser({
	parse(value) {
		if (value === null) {
			return false;
		}
		if (value === '') {
			return true;
		}

		return null;
	},
	serialize(value) {
		return value ? '' : null;
	},
});

export const asDID = createParser({
	parse(value) {
		if (typeof value === 'string' && DID_RE.test(value)) {
			return value as At.DID;
		}

		return null;
	},
	serialize(value) {
		return value;
	},
});

export const asHandle = createParser({
	parse(value) {
		if (typeof value === 'string' && HANDLE_RE.test(value)) {
			return value;
		}

		return null;
	},
	serialize(value) {
		return value;
	},
});

export const asIdentifier = createParser({
	parse(value) {
		if (typeof value === 'string' && DID_OR_HANDLE_RE.test(value)) {
			return value;
		}

		return null;
	},
	serialize(value) {
		return value;
	},
});
