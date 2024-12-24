import { Component, createMemo, createSignal, For, JSX } from 'solid-js';

type EmptyObjectKeys<T> = {
	[K in keyof T]: T[K] extends Record<string, never> ? K : never;
}[keyof T];

export type WizardConstraints = Record<string, Record<string, any>>;

export interface WizardStepProps<TConstraints extends WizardConstraints, TStep extends keyof TConstraints> {
	data: TConstraints[TStep];
	isActive: () => boolean;
	onNext: <TNext extends keyof TConstraints>(step: TNext, data: TConstraints[TNext]) => void;
	onPrevious: () => void;
}

export interface WizardProps<TConstraints extends WizardConstraints> {
	initialStep: EmptyObjectKeys<TConstraints>;
	components: {
		[TStep in keyof TConstraints]: Component<WizardStepProps<TConstraints, TStep>>;
	};
	onStepChange?: (step: number) => void;
}

interface HistoryEntry<TConstraints extends WizardConstraints> {
	step: keyof TConstraints;
	data: TConstraints[keyof TConstraints];
}

export const Wizard = <TConstraints extends WizardConstraints>(props: WizardProps<TConstraints>) => {
	const components = props.components;
	const onStepChange = props.onStepChange;

	const [history, setHistory] = createSignal<HistoryEntry<TConstraints>[]>([
		// @ts-expect-error
		{ step: props.initialStep, data: {} },
	]);

	const current = createMemo(() => {
		return history().length - 1;
	});

	const handleNext = <TNext extends keyof TConstraints>(step: TNext, data: TConstraints[TNext]) => {
		const entries = history();

		setHistory([...entries, { step, data }]);
		onStepChange?.(entries.length + 1);
	};

	const handleBack = () => {
		const entries = history();

		if (entries.length > 1) {
			setHistory(entries.slice(0, -1));
			onStepChange?.(entries.length - 1);
		}
	};

	return (
		<div class="pb-8">
			<For each={history()}>
				{({ step, data }, index) => {
					const Component = components[step];

					const isActive = createMemo(() => current() === index());

					return (
						<fieldset
							disabled={!isActive()}
							class={`flex min-w-0 gap-4 px-4` + (!isActive() ? ` opacity-50` : ``)}
						>
							<div class="flex flex-col items-center gap-1 pt-4">
								<div class="grid h-6 w-6 place-items-center rounded-full bg-gray-200 py-1 text-center text-sm font-medium leading-none text-black">
									{'' + (index() + 1)}
								</div>
								<div hidden={isActive()} class="-mb-3 grow border-l border-gray-400"></div>
							</div>

							<Component data={data} isActive={isActive} onNext={handleNext} onPrevious={handleBack} />
						</fieldset>
					);
				}}
			</For>
		</div>
	);
};

export interface StageProps {
	title: string;
	disabled?: boolean;
	onSubmit?: JSX.EventHandler<HTMLFormElement, SubmitEvent>;
	children: JSX.Element;
}

export const Stage = (props: StageProps) => {
	const onSubmit = props.onSubmit;

	return (
		<form
			onSubmit={(ev) => {
				ev.preventDefault();
				onSubmit?.(ev);
			}}
			class="flex min-w-0 grow flex-col py-4"
		>
			<h3 class="mb-[1.125rem] mt-0.5 text-sm font-semibold">{props.title}</h3>
			<fieldset
				disabled={props.disabled}
				class={`flex min-w-0 flex-col gap-6` + (props.disabled ? ` opacity-50` : ``)}
			>
				{props.children}
			</fieldset>
		</form>
	);
};

export interface StageActionsProps {
	hidden?: boolean;
	children: JSX.Element;
}

export interface StageActionsDividerProps {}

export const StageActions = (props: StageActionsProps) => {
	return (
		<div hidden={props.hidden} class="flex flex-wrap gap-4">
			{props.children}
		</div>
	);
};

StageActions.Divider = (_props: StageActionsDividerProps) => {
	return <div class="grow"></div>;
};

export interface StageErrorViewProps {
	error: string | undefined;
}

export const StageErrorView = (props: StageErrorViewProps) => {
	return (
		<div
			hidden={!props.error}
			class="whitespace-pre-wrap text-[0.8125rem] font-medium leading-5 text-red-800"
		>
			{'' + props.error}
		</div>
	);
};
