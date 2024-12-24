import { customAlphabet } from 'nanoid';

const generateCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', 10);

export const generateConfirmationCode = () => {
	const code = generateCode();
	return `${code.slice(0, 5)}-${code.slice(5, 10)}`;
};
