import { JSX } from 'solid-js';

interface ButtonProps {
	children?: JSX.Element;
	variant?: 'primary' | 'secondary';
	type?: 'button' | 'submit';
	onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
}

const buttonStyles = ({ variant = 'primary' }: ButtonProps): string => {
	let cn = `flex h-9 select-none items-center rounded px-4 text-sm font-semibold`;

	if (variant === 'primary') {
		cn += ` bg-purple-800 text-white hover:bg-purple-700 active:bg-purple-700`;
	} else if (variant === 'secondary') {
		cn += ` bg-gray-200 text-black hover:bg-gray-300 active:bg-gray-300`;
	}

	return cn;
};

const Button = (props: ButtonProps) => {
	return (
		<button type={props.type ?? 'button'} class={buttonStyles(props)} onClick={props.onClick}>
			{props.children}
		</button>
	);
};

export default Button;
