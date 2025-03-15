import * as v from '@badrap/valita';

export type ToValidator<T> = T extends readonly [infer Head, ...infer Rest]
	? Rest extends []
		? v.TupleType<[ToValidator<Head>]>
		: v.TupleType<[ToValidator<Head>, ...ToValidatorTuple<Rest>]>
	: T extends ReadonlyArray<infer E>
		? v.ArrayType<ToValidator<E>>
		: T extends object
			? ToObjectValidator<T>
			: v.Type<T>;

// Helper type for converting tuple types
type ToValidatorTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Rest]
	? Rest extends []
		? [ToValidator<Head>]
		: [ToValidator<Head>, ...ToValidatorTuple<Rest>]
	: [];

// Helper type for converting object types
type ToObjectValidator<T extends object> = v.ObjectType<
	{
		[K in keyof T]-?: undefined extends T[K] ? v.Optional<Exclude<T[K], undefined>> : ToValidator<T[K]>;
	},
	undefined
>;
