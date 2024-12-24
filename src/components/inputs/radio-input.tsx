import { JSX } from 'solid-js';

import { createId } from '~/lib/hooks/id';

import { BoundInputEvent } from './_types';

interface RadioInputProps<T extends string> {
	label: JSX.Element;
	name?: string;
	required?: boolean;
	value?: T | undefined;
	options: { value: T; label: string }[];
	onChange?: (next: T, event: BoundInputEvent<HTMLInputElement>) => void;
}

const RadioInput = <T extends string>(props: RadioInputProps<T>) => {
	const fieldId = createId();

	const onChange = props.onChange;
	const hasValue = 'value' in props;

	return (
		<fieldset class="flex flex-col gap-2">
			<legend class="contents">
				<span class="font-semibold text-gray-600">{props.label}</span>
			</legend>

			{props.options.map(({ value, label }, idx) => {
				const optionId = fieldId + idx;

				return (
					<span class="flex items-center gap-3">
						<input
							type="radio"
							id={optionId}
							name={props.name ?? fieldId}
							required={props.required}
							value={value}
							checked={hasValue ? props.value === value : false}
							class="border-gray-400 text-purple-800 focus:ring-purple-800"
							onInput={(event) => onChange?.(value, event)}
						/>

						<label for={optionId} class="text-sm">
							{label}
						</label>
					</span>
				);
			})}
		</fieldset>
	);
};

export default RadioInput;
