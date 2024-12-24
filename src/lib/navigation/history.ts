// Fork of `history` npm package
// Repository: github.com/remix-run/history
// Commit: 3e9dab413f4eda8d6bce565388c5ddb7aeff9f7e
// Most of the changes are just trimming it down to only include the browser
// history implementation.

export type Action = 'traverse' | 'push' | 'replace' | 'update';

export interface Path {
	/** A URL pathname, beginning with a /. */
	pathname: string;
	/** A URL search string, beginning with a ?. */
	search: string;
	/** A URL fragment identifier, beginning with a #. */
	hash: string;
}

export interface Location extends Path {
	/** Position of this history */
	index: number;
	/** A value of arbitrary data associated with this location. */
	state: unknown;
	/** A unique string associated with this location */
	key: string;
}

export interface Update {
	action: Action;
	location: Location;
}

export type Listener = (update: Update) => void;

export interface Transition extends Update {
	retry(): void;
}

export type Blocker = (tx: Transition) => void;

export type To = string | Partial<Path>;

export interface History {
	readonly location: Location;

	createHref(to: To): string;

	navigate(to: To, options?: NavigateOptions): void;
	update(state: any): void;

	go(delta: number): void;
	back(): void;
	forward(): void;

	listen(listener: Listener): () => void;
	block(blocker: Blocker): () => void;
}

export interface NavigateOptions {
	replace?: boolean;
	state?: unknown;
}

/**
 * A browser history stores the current location in regular URLs in a web
 * browser environment. This is the standard for most web apps and provides the
 * cleanest URLs the browser's address bar.
 */
export interface BrowserHistory extends History {}

const warning = (cond: any, message: string) => {
	if (!import.meta.env.PROD && !cond) {
		console.warn(message);
	}
};

interface HistoryState {
	usr: any;
	key?: string;
	idx: number;
}

const BeforeUnloadEventType = 'beforeunload';
const PopStateEventType = 'popstate';

export interface BrowserHistoryOptions {
	window?: Window;
}

/**
 * Browser history stores the location in regular URLs. This is the standard for
 * most web apps, but it requires some configuration on the server to ensure you
 * serve the same app at multiple URLs.
 */
export const createBrowserHistory = (options: BrowserHistoryOptions = {}): BrowserHistory => {
	const { window = document.defaultView! } = options;
	const globalHistory = window.history;

	const getCurrentLocation = (): Location => {
		const { pathname, search, hash } = window.location;
		const state = globalHistory.state || {};
		return {
			pathname,
			search,
			hash,
			index: state.idx,
			state: state.usr || null,
			key: state.key || 'default',
		};
	};

	let blockedPopTx: Transition | null = null;
	const handlePop = () => {
		if (blockedPopTx) {
			blockers.call(blockedPopTx);
			blockedPopTx = null;
		} else {
			const nextAction: Action = 'traverse';
			const nextLocation = getCurrentLocation();
			const nextIndex = nextLocation.index;

			if (blockers.length) {
				if (nextIndex != null) {
					const delta = location.index - nextIndex;
					if (delta) {
						// Revert the POP
						blockedPopTx = {
							action: nextAction,
							location: nextLocation,
							retry() {
								go(delta * -1);
							},
						};

						go(delta);
					}
				} else {
					// Trying to POP to a location with no index. We did not create
					// this location, so we can't effectively block the navigation.
					warning(
						false,
						// TODO: Write up a doc that explains our blocking strategy in
						// detail and link to it here so people can understand better what
						// is going on and how to avoid it.
						`You are trying to block a POP navigation to a location that was not ` +
							`created by the history library. The block will fail silently in ` +
							`production, but in general you should do all navigation with the ` +
							`history library (instead of using window.history.pushState directly) ` +
							`to avoid this situation.`,
					);
				}
			} else {
				applyTx(nextAction);
			}
		}
	};

	const listeners = createEvents<Listener>();
	const blockers = createEvents<Blocker>();

	let location = getCurrentLocation();

	window.addEventListener(PopStateEventType, handlePop);

	if (location.index == null) {
		globalHistory.replaceState({ ...globalHistory.state, idx: (location.index = 0) }, '');
	}

	const createHref = (to: To): string => {
		return typeof to === 'string' ? to : createPath(to);
	};

	// state defaults to `null` because `window.history.state` does
	const getNextLocation = (to: To, index: number, state: any = null): Location => {
		return {
			pathname: location.pathname,
			hash: '',
			search: '',
			...(typeof to === 'string' ? parsePath(to) : to),
			index,
			state,
			key: createKey(),
		};
	};

	const getHistoryStateAndUrl = (nextLocation: Location): [HistoryState, string] => {
		return [
			{
				usr: nextLocation.state,
				key: nextLocation.key,
				idx: nextLocation.index,
			},
			createHref(nextLocation),
		];
	};

	const allowTx = (action: Action, location: Location, retry: () => void): boolean => {
		return !blockers.length || (blockers.call({ action, location, retry }), false);
	};

	const applyTx = (nextAction: Action): void => {
		location = getCurrentLocation();
		listeners.call({ action: nextAction, location });
	};

	const navigate = (to: To, { replace, state }: NavigateOptions = {}): void => {
		const nextAction: Action = !replace ? 'push' : 'replace';
		const nextIndex = location.index + (!replace ? 1 : 0);
		const nextLocation = getNextLocation(to, nextIndex, state);

		const retry = () => {
			navigate(to, { replace, state });
		};

		if (allowTx(nextAction, nextLocation, retry)) {
			const [historyState, url] = getHistoryStateAndUrl(nextLocation);

			// TODO: Support forced reloading
			if (!replace) {
				// try...catch because iOS limits us to 100 pushState calls :/
				try {
					globalHistory.pushState(historyState, '', url);
				} catch {
					// They are going to lose state here, but there is no real
					// way to warn them about it since the page will refresh...
					window.location.assign(url);
				}
			} else {
				globalHistory.replaceState(historyState, '', url);
			}

			applyTx(nextAction);
		}
	};

	const update = (state: any): void => {
		const nextAction: Action = 'update';
		const nextLocation = { ...location, state };

		const [historyState, url] = getHistoryStateAndUrl(nextLocation);

		// TODO: Support forced reloading
		globalHistory.replaceState(historyState, '', url);

		applyTx(nextAction);
	};

	const go = (delta: number): void => {
		globalHistory.go(delta);
	};

	const history: BrowserHistory = {
		get location() {
			return location;
		},
		createHref,
		navigate,
		update,
		go,
		back: () => {
			return go(-1);
		},
		forward: () => {
			return go(1);
		},
		listen: (listener) => {
			return listeners.push(listener);
		},
		block: (blocker) => {
			const unblock = blockers.push(blocker);

			if (blockers.length === 1) {
				window.addEventListener(BeforeUnloadEventType, promptBeforeUnload);
			}

			return () => {
				unblock();

				// Remove the beforeunload listener so the document may
				// still be salvageable in the pagehide event.
				// See https://html.spec.whatwg.org/#unloading-documents
				if (!blockers.length) {
					window.removeEventListener(BeforeUnloadEventType, promptBeforeUnload);
				}
			};
		},
	};

	return history;
};

const promptBeforeUnload = (event: BeforeUnloadEvent): void => {
	// Cancel the event.
	event.preventDefault();
};

interface Events<F extends (arg: any) => void> {
	length: number;
	push: (fn: F) => () => void;
	call: (arg: Parameters<F>[0]) => void;
}

const createEvents = <F extends (arg: any) => void>(): Events<F> => {
	const handlers: F[] = [];

	return {
		get length() {
			return handlers.length;
		},
		push(fn: F) {
			handlers.push(fn);

			return () => {
				const index = handlers.indexOf(fn);

				if (index !== -1) {
					handlers.splice(index, 1);
				}
			};
		},
		call(arg) {
			for (let idx = 0, len = handlers.length; idx < len; idx++) {
				(0, handlers[idx])(arg);
			}
		},
	};
};

const createKey = () => {
	return crypto.randomUUID();
};

/**
 * Creates a string URL path from the given pathname, search, and hash components.
 */
export const createPath = ({ pathname = '/', search = '', hash = '' }: Partial<Path>) => {
	if (search && search !== '?') {
		pathname += search.charAt(0) === '?' ? search : '?' + search;
	}
	if (hash && hash !== '#') {
		pathname += hash.charAt(0) === '#' ? hash : '#' + hash;
	}
	return pathname;
};

/**
 * Parses a string URL path into its separate pathname, search, and hash components.
 */
export const parsePath = (path: string): Partial<Path> => {
	const parsedPath: Partial<Path> = {};

	if (path) {
		const hashIndex = path.indexOf('#');
		if (hashIndex >= 0) {
			parsedPath.hash = path.substr(hashIndex);
			path = path.substr(0, hashIndex);
		}

		const searchIndex = path.indexOf('?');
		if (searchIndex >= 0) {
			parsedPath.search = path.substr(searchIndex);
			path = path.substr(0, searchIndex);
		}

		if (path) {
			parsedPath.pathname = path;
		}
	}

	return parsedPath;
};
