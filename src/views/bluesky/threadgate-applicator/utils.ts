import { ThreadgateState } from './page';

const collator = new Intl.Collator('en');

export const sortThreadgateAllow = (allow: ThreadgateState['allow']) => {
	if (allow?.length) {
		allow.sort((a, b) => {
			const aType = a.$type;
			const bType = b.$type;

			if (aType === 'app.bsky.feed.threadgate#listRule' && aType === bType) {
				return collator.compare(a.list, b.list);
			}

			return collator.compare(aType, bType);
		});
	}
};

export const sortThreadgateState = ({ allow }: ThreadgateState) => {
	sortThreadgateAllow(allow);
};
