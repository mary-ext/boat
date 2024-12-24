export const TOTP_RE = /^([a-zA-Z0-9]{5})[\- ]?([a-zA-Z0-9]{5})$/;

export const formatTotpCode = (code: string) => {
	const match = TOTP_RE.exec(code);
	if (match !== null) {
		return `${match[1]}-${match[2]}`.toUpperCase();
	}

	return undefined;
};
