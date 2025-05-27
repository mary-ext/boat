import { Client, simpleFetchHandler } from '@atcute/client';

const APPVIEW_URL = import.meta.env.VITE_APPVIEW_URL;

export const appViewRpc = new Client({ handler: simpleFetchHandler({ service: APPVIEW_URL }) });
