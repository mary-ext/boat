import { formatQueryError } from '~/api/utils/error';

import Button from '~/components/inputs/button';

export interface ErrorViewProps {
	error: unknown;
	onRetry?: () => void;
}

const ErrorView = (props: ErrorViewProps) => {
	const onRetry = props.onRetry;

	return (
		<div class="flex flex-col gap-4 p-4">
			<div>
				<p class="font-bold">Something went wrong</p>
				<p class="text-gray-600">{formatQueryError(props.error)}</p>
			</div>

			<div class="empty:hidden">{onRetry && <Button onClick={onRetry}>Try again</Button>}</div>
		</div>
	);
};

export default ErrorView;
