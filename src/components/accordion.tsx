import { createSignal, type JSX, Show } from 'solid-js';

import ChevronRightIcon from '~/components/ic-icons/baseline-chevron-right';

export interface AccordionProps {
	title: string;
	children: JSX.Element;
	defaultOpen?: boolean;
}

export const Accordion = (props: AccordionProps) => {
	const [isOpen, setIsOpen] = createSignal(props.defaultOpen ?? false);

	return (
		<div class="border-b border-gray-200">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen())}
				class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
			>
				<ChevronRightIcon
					class={`h-5 w-5 text-gray-500 transition-transform` + (isOpen() ? ` rotate-90` : ``)}
				/>
				<span class="font-semibold">{props.title}</span>
			</button>

			<Show when={isOpen()}>
				<div class="pb-4 pl-12 pr-4">{props.children}</div>
			</Show>
		</div>
	);
};

export interface SubsectionProps {
	title: string;
	children: JSX.Element;
}

export const Subsection = (props: SubsectionProps) => {
	return (
		<div class="mb-4 last:mb-0">
			<h4 class="mb-3 text-sm font-semibold text-gray-600">{props.title}</h4>
			<div class="flex flex-col gap-3">{props.children}</div>
		</div>
	);
};

export interface StatusBadgeProps {
	variant: 'idle' | 'pending' | 'success' | 'error';
	children: JSX.Element;
}

export const StatusBadge = (props: StatusBadgeProps) => {
	const variantStyles = () => {
		switch (props.variant) {
			case 'idle':
				return 'bg-gray-100 text-gray-600';
			case 'pending':
				return 'bg-yellow-100 text-yellow-800';
			case 'success':
				return 'bg-green-100 text-green-800';
			case 'error':
				return 'bg-red-100 text-red-800';
		}
	};

	return (
		<span class={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${variantStyles()}`}>
			{props.children}
		</span>
	);
};
