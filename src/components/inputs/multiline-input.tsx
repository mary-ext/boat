import { createEffect, JSX } from 'solid-js';

import { createId } from '~/lib/hooks/id';

import { BoundInputEvent } from './_types';

interface MultilineInputProps {
	label: JSX.Element;
	name?: string;
	required?: boolean;
	autocomplete?: 'off' | 'on';
	autocorrect?: 'off' | 'on';
	value?: string;
	autofocus?: boolean;
	onChange?: (next: string, event: BoundInputEvent<HTMLTextAreaElement>) => void;
}

const MultilineInput = (props: MultilineInputProps) => {
	const fieldId = createId();

	const onChange = props.onChange;

	return (
		<div class="flex flex-col gap-2">
			<label for={fieldId} class="font-semibold text-gray-600">
				{props.label}
			</label>

			<textarea
				ref={(node) => {
					if ('autofocus' in props) {
						createEffect(() => {
							if (props.autofocus) {
								node.focus();
							}
						});
					}
				}}
				name={props.name}
				required={props.required}
				autocomplete={props.autocomplete}
				// @ts-expect-error
				autocorrect={props.autocorrect}
				rows={22}
				value={props.value}
				class="resize-y break-all rounded border border-gray-400 px-3 py-2 font-mono text-xs tracking-wider placeholder:text-gray-400 focus:border-purple-800 focus:ring-1 focus:ring-purple-800 focus:ring-offset-0"
				style="field-sizing: content"
				onInput={(event) => onChange?.(event.target.value, event)}
			/>
		</div>
	);
};

export default MultilineInput;
