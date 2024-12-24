export type UnwrapArray<T> = T extends (infer V)[] ? V : never;
export type AccessorMaybe<T> = T | (() => T);
