/* @refresh reload */
import {
	type Accessor,
	type Component,
	For,
	type JSX,
	type Owner,
	createContext,
	createEffect,
	createMemo,
	createRoot,
	createSignal,
	getOwner,
	onCleanup,
	untrack,
	useContext,
} from 'solid-js';
import { delegateEvents } from 'solid-js/web';

import { EventEmitter } from '@mary/events';
import { Freeze } from '@mary/solid-freeze';

import { createEventListener } from '../hooks/event-listener';

import type { History, Location } from './history';
import type { HistoryLogger } from './logger';

// This is the only application-specific code we have here, might need to
// move it elsewhere, maybe as a separate package?
export interface RouteMeta {
	name?: string;
	main?: boolean;
	public?: boolean;
}

export interface RouteDefinition {
	path: string;
	component: Component;
	single?: boolean;
	meta?: RouteMeta;
	validate?: (params: Record<string, string>) => boolean;
}

interface InternalRouteDefinition extends RouteDefinition {
	_regex?: RegExp;
}

export interface RouterOptions {
	history: History;
	logger: HistoryLogger;
	routes: RouteDefinition[];
}

interface MatchedRoute {
	readonly id: string | undefined;
	readonly def: RouteDefinition;
	readonly params: Record<string, string>;
}

export interface MatchedRouteState extends MatchedRoute {
	readonly id: string;
	scrollPos: { x: number; y: number } | undefined;
}

interface RouterState {
	active: string;
	views: Record<string, MatchedRouteState>;
	singles: Record<string, MatchedRouteState>;
}

interface ViewContextObject {
	owner: Owner | null;
	route: MatchedRouteState;
	isActive: () => boolean;
}

let _entry: Location;

let _routes: InternalRouteDefinition[] | undefined;
let _cleanup: (() => void) | undefined;

const [state, setState] = createSignal<RouterState>({
	active: '',
	views: {},
	singles: {},
});

interface RouteEvent {
	focus: boolean;
	enter: boolean;
}

const routerEvents = new EventEmitter<{ [key: string]: [event: RouteEvent] }>();

export { routerEvents as UNSAFE_routerEvents };

export const configureRouter = ({ history, logger: log, routes }: RouterOptions) => {
	_cleanup?.();

	_routes = routes;

	{
		_entry = log.current;

		const pathname = _entry.pathname;
		const matched = matchRoute(pathname);

		if (matched) {
			const nextKey = matched.id || _entry.key;

			const isSingle = !!matched.id;
			const matchedState: MatchedRouteState = {
				...matched,
				id: nextKey,
				scrollPos: undefined,
			};

			const next: Record<string, MatchedRouteState> = { [nextKey]: matchedState };

			setState({
				active: nextKey,
				views: isSingle ? {} : next,
				singles: isSingle ? next : {},
			});
		}
	}

	_cleanup = createRoot((cleanup) => {
		onCleanup(
			history.listen(({ action, location: nextEntry }) => {
				const currentEntry = _entry;
				_entry = nextEntry;

				if (action !== 'update') {
					const pathname = nextEntry.pathname;
					const matched = matchRoute(pathname);

					if (!matched) {
						return;
					}

					const current = state();

					let views = current.views;
					let singles = current.singles;
					let isNew = false;

					const prevId = current.active;

					const nextId = matched.id || nextEntry.key;
					const matchedState: MatchedRouteState = {
						...matched,
						id: nextId,
						scrollPos: undefined,
					};

					let nextViews: typeof views | undefined;

					// Recreate the views object to remove no longer reachable views if:
					// - We're pushing a new page, or replacing the current page
					// - We're traversing and the intended index is lower than current
					if (action !== 'traverse' || nextEntry.index < currentEntry.index) {
						const entries = log.entries;

						nextViews = {};

						for (let idx = 0, len = entries.length; idx < len; idx++) {
							const entry = entries[idx];
							const key = entry?.key;

							if (key !== undefined && key in views) {
								nextViews[key] = views[key];
							}
						}
					}

					if (!matched.id) {
						if (!(nextId in views)) {
							if (nextViews) {
								nextViews[nextId] = matchedState;
								isNew = true;
							} else {
								nextViews = { ...views, [nextId]: matchedState };
								isNew = true;
							}
						}
					} else {
						if (!(nextId in singles)) {
							singles = { ...singles, [nextId]: matchedState };
							isNew = true;
						}
					}

					if (nextViews) {
						views = nextViews;
					}

					{
						const prev = current.views[prevId] || current.singles[prevId];
						if (prev) {
							prev.scrollPos = { x: window.scrollX, y: window.scrollY };
						}
					}

					routerEvents.emit(prevId, { focus: false, enter: false });

					setState({ active: nextId, views: views, singles: singles });

					if (isNew) {
						// Scroll to top if we're pushing or replacing, it's a new page.
						window.scrollTo(0, 0);
					} else {
						{
							const next = views[nextId] || singles[nextId];
							if (next?.scrollPos) {
								const pos = next.scrollPos;
								window.scrollTo(pos.x, pos.y);
							}
						}

						routerEvents.emit(nextId, {
							focus: true,
							enter: action !== 'traverse' || nextEntry.index > currentEntry.index,
						});
					}
				}
			}),
		);

		delegateEvents(['click']);
		createEventListener(document, 'click', (evt) => {
			if (
				evt.defaultPrevented ||
				evt.button !== 0 ||
				evt.metaKey ||
				evt.altKey ||
				evt.ctrlKey ||
				evt.shiftKey
			) {
				return;
			}

			const a = evt.composedPath().find((el): el is HTMLAnchorElement => el instanceof HTMLAnchorElement);

			if (!a) {
				return;
			}

			const href = a.href;
			const target = a.target;

			if (!href || (target !== '' && target !== '_self')) {
				return;
			}

			const { origin, pathname, search, hash } = new URL(href);

			if (location.origin !== origin) {
				return;
			}

			evt.preventDefault();
			history.navigate({ pathname, search, hash });
		});

		return cleanup;
	});
};

const ViewContext = createContext<ViewContextObject>();

const getMatchedRoute = () => {
	const current = state();
	const active = current.active;

	const match = current.singles[active] || current.views[active];

	if (match) {
		return match;
	}
};

export const useMatchedRoute = () => {
	return createMemo(getMatchedRoute);
};

const useViewContext = () => {
	return useContext(ViewContext)!;
};

export { useViewContext as UNSAFE_useViewContext };

export const useParams = <T extends Record<string, string>>() => {
	return useViewContext().route.params as T;
};

export const onRouteEnter = (cb: () => void) => {
	const { route, isActive } = useViewContext();

	if (untrack(isActive)) {
		cb();
	}

	onCleanup(routerEvents.on(route.id, (e) => e.enter && cb()));
};

export const useIsFocused = (): Accessor<boolean> => {
	const { isActive } = useViewContext();

	return isActive;
};

export const createFocusEffect = (cb: () => void) => {
	const isFocused = useIsFocused();

	createEffect(() => {
		if (isFocused()) {
			createEffect(cb);
		}
	});
};

export const useTitle = (cb: () => string) => {
	createFocusEffect(() => {
		document.title = cb();
	});
};

export interface RouterViewProps {
	render: (matched: MatchedRouteState) => JSX.Element;
}

export const RouterView = (props: RouterViewProps) => {
	const render = props.render;

	const renderView = (matched: MatchedRouteState) => {
		const id = matched.id;

		const active = createMemo((): boolean => state().active === id);

		const context: ViewContextObject = {
			owner: getOwner(),
			route: matched,
			isActive: active,
		};

		return (
			<Freeze freeze={!active()}>
				<ViewContext.Provider value={context}>{render(matched)}</ViewContext.Provider>
			</Freeze>
		);
	};

	return (
		<>
			<For each={Object.values(state().views)}>{renderView}</For>
			<For each={Object.values(state().singles)}>{renderView}</For>
		</>
	);
};

const matchRoute = (path: string): MatchedRoute | null => {
	for (let idx = 0, len = _routes!.length; idx < len; idx++) {
		const route = _routes![idx];

		const validate = route.validate;
		const pattern = (route._regex ||= buildPathRegex(route.path));

		const match = pattern.exec(path);

		if (!match || (validate && !validate(match.groups!))) {
			continue;
		}

		const params = match.groups!;

		let id: string | undefined;
		if (route.single) {
			id = '@' + idx;
			for (const param in params) {
				id += '/' + params[param];
			}
		}

		return { id: id, def: route, params: params };
	}

	return null;
};

const buildPathRegex = (path: string) => {
	let source =
		'^' +
		path
			.replace(/\/*\*?$/, '')
			.replace(/^\/*/, '/')
			.replace(/[\\.*+^${}|()[\]]/g, '\\$&')
			.replace(/\/:([\w-]+)(\?)?/g, '/$2(?<$1>[^\\/]+)$2');

	source += path.endsWith('*')
		? path === '*' || path === '/*'
			? '(?<$>.*)$'
			: '(?:\\/(?<$>.+)|\\/*)$'
		: '\\/*$';

	return new RegExp(source, 'i');
};
