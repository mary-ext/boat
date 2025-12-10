import { createEffect, createSignal, onCleanup } from 'solid-js';

import { history } from '~/globals/navigation';

import { useTitle } from '~/lib/navigation/router';

import PageHeader from '~/components/page-header';

import { MigrationProvider } from './context';

import SourceAccountSection from './sections/source-account';
import DestinationAccountSection from './sections/destination-account';
import RepositorySection from './sections/repository';
import BlobsSection from './sections/blobs';
import PreferencesSection from './sections/preferences';
import IdentitySection from './sections/identity';
import AccountStatusSection from './sections/account-status';

const AccountMigratePage = () => {
	const [hasStarted, setHasStarted] = createSignal(false);

	createEffect(() => {
		if (hasStarted()) {
			const cleanup = history.block((tx) => {
				if (window.confirm(`You have a migration in progress. Leave this page?`)) {
					cleanup();
					tx.retry();
				}
			});

			onCleanup(cleanup);
		}
	});

	useTitle(() => `Migrate account — boat`);

	return (
		<MigrationProvider>
			<PageHeader title="Migrate account" subtitle="Move your account data to another server" />

			<div class="flex flex-col">
				<SourceAccountSection onStarted={() => setHasStarted(true)} />
				<DestinationAccountSection />
				<RepositorySection />
				<BlobsSection />
				<PreferencesSection />
				<IdentitySection />
				<AccountStatusSection />
			</div>
		</MigrationProvider>
	);
};

export default AccountMigratePage;
