import { createEffect, JSX } from 'solid-js';
import { createId } from '~/lib/hooks/id';

interface TextInputProps {
	label: JSX.Element;
	blurb?: JSX.Element;
	monospace?: boolean;
	type?: 'text' | 'password' | 'url' | 'email';
	name?: string;
	required?: boolean;
	autocomplete?: 'off' | 'on' | 'one-time-code' | 'username';
	autocorrect?: 'off' | 'on';
	pattern?: string;
	placeholder?: string;
	value?: string;
	autofocus?: boolean;
	onChange?: (next: string) => void;
}

const textInputStyles = ({ monospace = false }: TextInputProps) => {
	let cn = `rounded border border-gray-400 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-purple-800 focus:ring-1 focus:ring-purple-800 focus:ring-offset-0`;

	if (monospace) {
		cn += ` font-mono tracking-wide`;
	}

	return cn;
};

const TextInput = (props: TextInputProps) => {
	const fieldId = createId();

	const onChange = props.onChange;

	return (
		<div class="flex flex-col gap-2">
			<label for={fieldId} class="font-semibold text-gray-600">
				{props.label}
			</label>

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
				type={props.type ?? 'text'}
				id={fieldId}
				name={props.type}
				required={props.required}
				autocomplete={props.autocomplete}
				pattern={props.pattern}
				placeholder={props.placeholder}
				value={props.value ?? ''}
				class={textInputStyles(props)}
				onInput={(ev) => onChange?.(ev.target.value)}
			/>

			<p class="text-pretty text-[0.8125rem] leading-5 text-gray-500 empty:hidden">{props.blurb}</p>
		</div>
	);
};

export default TextInput;
