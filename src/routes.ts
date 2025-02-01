import { lazy } from 'solid-js';

import type { RouteDefinition } from '~/lib/navigation/router';

const routes: RouteDefinition[] = [
	{
		path: '/',
		component: lazy(() => import('./views/frontpage')),
	},

	{
		path: '/bsky-threadgate-applicator',
		component: lazy(() => import('./views/bluesky/threadgate-applicator/page')),
	},

	{
		path: '/blob-export',
		component: lazy(() => import('./views/blob/blob-export')),
	},

	{
		path: '/crypto-generate',
		component: lazy(() => import('./views/crypto/crypto-generate')),
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
		path: '/plc-applicator',
		component: lazy(() => import('./views/identity/plc-applicator/page')),
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
