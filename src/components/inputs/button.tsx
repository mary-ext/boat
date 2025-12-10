import { createMemo, type JSX } from 'solid-js';

interface ButtonProps {
	children?: JSX.Element;
	disabled?: boolean;
	variant?: 'primary' | 'secondary' | 'outline';
	type?: 'button' | 'submit';
	href?: string;
	onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
}

const buttonStyles = ({ variant = 'primary', disabled = false }: ButtonProps): string => {
	let cn = `flex h-9 select-none items-center rounded px-4 text-sm font-semibold`;

	if (variant === 'primary') {
		cn += ` bg-purple-800 text-white hover:bg-purple-700 active:bg-purple-700`;
	} else if (variant === 'secondary') {
		cn += ` bg-gray-200 text-black hover:bg-gray-300 active:bg-gray-300`;
	} else if (variant === 'outline') {
		cn += ` border border-gray-300 text-gray-800 hover:bg-gray-100 active:bg-gray-100`;
	}

	if (disabled) {
		cn += ` pointer-events-none opacity-50`;
	}

	return cn;
};

const Button = (props: ButtonProps) => {
	const hasLink = createMemo(() => props.href !== undefined);

	return (() => {
		if (hasLink()) {
			return (
				<a href={!props.disabled ? props.href : undefined} class={buttonStyles(props)}>
					{props.children}
				</a>
			);
		}

		return (
			<button
				type={props.type ?? 'button'}
				disabled={props.disabled}
				class={buttonStyles(props)}
				onClick={props.onClick}
			>
				{props.children}
			</button>
		);
	}) as unknown as JSX.Element;
};

export default Button;
