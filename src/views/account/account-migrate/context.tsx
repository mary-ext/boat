import { createContext, createSignal, useContext, type JSX } from 'solid-js';

import type { CredentialManager } from '@atcute/client';
import type { DidDocument } from '@atcute/identity';
import type { AtprotoDid, Did } from '@atcute/lexicons/syntax';

export interface SourceAccount {
	did: AtprotoDid;
	didDoc: DidDocument;
	pdsUrl: string;
	manager: CredentialManager | null;
}

export interface DestinationAccount {
	pdsUrl: string;
	serviceDid: Did;
	manager: CredentialManager | null;
}

export interface MigrationContextValue {
	source: () => SourceAccount | null;
	setSource: (account: SourceAccount | null) => void;
	destination: () => DestinationAccount | null;
	setDestination: (account: DestinationAccount | null) => void;
}

const MigrationContext = createContext<MigrationContextValue>();

export const MigrationProvider = (props: { children: JSX.Element }) => {
	const [source, setSource] = createSignal<SourceAccount | null>(null);
	const [destination, setDestination] = createSignal<DestinationAccount | null>(null);

	const value: MigrationContextValue = {
		source,
		setSource,
		destination,
		setDestination,
	};

	return <MigrationContext.Provider value={value}>{props.children}</MigrationContext.Provider>;
};

export const useMigration = (): MigrationContextValue => {
	const context = useContext(MigrationContext);
	if (!context) {
		throw new Error('useMigration must be used within a MigrationProvider');
	}
	return context;
};
