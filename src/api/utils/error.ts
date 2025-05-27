import { ClientResponseError } from '@atcute/client';

export const formatQueryError = (err: unknown) => {
	if (err instanceof ClientResponseError) {
		const error = err.error;

		if (error === 'InvalidToken' || error === 'ExpiredToken') {
			return `Account session is no longer valid`;
		}

		if (error === 'UpstreamFailure') {
			return `Server appears to be experiencing issues, try again later`;
		}

		if (error === 'InternalServerError') {
			return `Server is having issues processing this request, try again later`;
		}

		return err.message;
	}

	if (err instanceof Error) {
		if (/NetworkError|Failed to fetch|timed out|abort/.test(err.message)) {
			return `Unable to access the internet, try again later`;
		}
	}

	return '' + err;
};
