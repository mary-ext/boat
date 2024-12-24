export type BoundInputEvent<T extends Element> = InputEvent & {
	currentTarget: T;
	target: T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement ? T : Element;
};
