let uid = 0;

export const createId = () => {
	return `_${uid++}_`;
};
