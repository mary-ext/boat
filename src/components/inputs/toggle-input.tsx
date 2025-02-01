import { createEffect } from 'solid-js';

import { createId } from '~/lib/hooks/id';

import { BoundInputEvent } from './_types';

export interface ToggleInputProps {
	label: string;
	name?: string;
	required?: boolean;
	checked?: boolean;
	autofocus?: boolean;
	onChange?: (next: boolean, event: BoundInputEvent<HTMLInputElement>) => void;
}

const ToggleInput = (props: ToggleInputProps) => {
	const fieldId = createId();

	const onChange = props.onChange;

	return (
		<div class="flex items-center gap-3">
			<input
				ref={(node) => {
					if ('autofocus' in props) {
						createEffect(() => {
							if (props.autofocus) {
								node.focus();
							}
						});
					}
				}}
				type="checkbox"
				id={fieldId}
				name={props.name}
				required={props.required}
				checked={props.checked}
				class="rounded border-gray-400 text-purple-800 focus:ring-purple-800"
				onInput={(event) => onChange?.(event.target.checked, event)}
			/>

			<label for={fieldId} class="text-sm">
				{props.label}
			</label>
		</div>
	);
};

export default ToggleInput;
