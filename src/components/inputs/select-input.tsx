import { createEffect, JSX } from 'solid-js';

import { createId } from '~/lib/hooks/id';

interface SelectInputProps<T extends string> {
	label: JSX.Element;
	blurb?: string;
	name?: string;
	required?: boolean;
	value?: T;
	autofocus?: boolean;
	options: { value: T; label: string; disabled?: boolean }[];
	onChange?: (next: T) => void;
}

const SelectInput = <T extends string>(props: SelectInputProps<T>) => {
	const fieldId = createId();

	const onChange = props.onChange;

	return (
		<div class="flex flex-col gap-2">
			<label for={fieldId} class="font-semibold text-gray-600">
				{props.label}
			</label>

			<select
				ref={(node) => {
					if ('autofocus' in props) {
						createEffect(() => {
							if (props.autofocus) {
								node.focus();
							}
						});
					}
				}}
				id={fieldId}
				name={props.name}
				required={props.required}
				value={props.value ?? ''}
				class="rounded border border-gray-400 py-2 pl-3 pr-8 text-sm focus:border-purple-800 focus:ring-1 focus:ring-purple-800 focus:ring-offset-0"
				onChange={(ev) => onChange?.(ev.target.value as T)}
			>
				{props.options.map((props) => {
					return (
						<option value={/* @once */ props.value} disabled={props.disabled}>
							{props.label}
						</option>
					);
				})}
			</select>

			<p class="text-pretty text-[0.8125rem] leading-5 text-gray-500 empty:hidden">{props.blurb}</p>
		</div>
	);
};

export default SelectInput;
