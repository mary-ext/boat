import { lazy } from 'solid-js';

import type { RouteDefinition } from '~/lib/navigation/router';

const routes: RouteDefinition[] = [
	{
		path: '/',
		component: lazy(() => import('./views/frontpage')),
	},

	{
		path: '/did-lookup',
		component: lazy(() => import('./views/identity/did-lookup')),
	},
	{
		path: '/plc-oplogs',
		component: lazy(() => import('./views/identity/plc-oplogs')),
	},

	{
		path: '/repo-export',
		component: lazy(() => import('./views/repository/repo-export')),
	},
	{
		path: '/car-unpack',
		component: lazy(() => import('./views/repository/car-unpack')),
	},

	{
		path: '*',
		component: lazy(() => import('./views/_404')),
	},
];

export default routes;
