import type { JSX } from 'solid-js';

interface PageHeaderProps {
	title: string;
	subtitle?: string;
	children?: JSX.Element;
}

const PageHeader = (props: PageHeaderProps) => {
	return (
		<>
			<div class="p-4">
				<h1 class="text-lg font-bold text-purple-800">{props.title}</h1>
				{props.subtitle && <p class="text-gray-600">{props.subtitle}</p>}
				{props.children}
			</div>
			<hr class="mx-4 border-gray-300" />
		</>
	);
};

export default PageHeader;
