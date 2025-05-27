import { defs } from '@atcute/did-plc';
import { Did } from '@atcute/lexicons/syntax';

export const getPlcAuditLogs = async ({ did, signal }: { did: Did<'plc'>; signal?: AbortSignal }) => {
	const origin = import.meta.env.VITE_PLC_DIRECTORY_URL;
	const response = await fetch(`${origin}/${did}/log/audit`, { signal });
	if (!response.ok) {
		throw new Error(`got resposne ${response.status}`);
	}

	const json = await response.json();
	return defs.indexedEntryLog.parse(json);
};
