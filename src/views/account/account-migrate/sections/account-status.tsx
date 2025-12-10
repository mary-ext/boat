import { Show } from 'solid-js';

import { Client, type CredentialManager, ok } from '@atcute/client';

import { createMutation } from '~/lib/utils/mutation';

import { Accordion, StatusBadge, Subsection } from '~/components/accordion';
import Button from '~/components/inputs/button';

import { useMigration } from '../context';

interface AccountStatus {
	activated: boolean;
	validDid: boolean;
	repoCommit: string;
	repoRev: string;
	repoBlocks: number;
	indexedRecords: number;
	privateStateValues: number;
	expectedBlobs: number;
	importedBlobs: number;
}

const AccountStatusSection = () => {
	const { source, destination } = useMigration();

	const checkSourceMutation = createMutation({
		async mutationFn({ manager }: { manager: CredentialManager }) {
			const sourceClient = new Client({ handler: manager });
			return await ok(sourceClient.get('com.atproto.server.checkAccountStatus')) as AccountStatus;
		},
		onError(err) {
			console.error(err);
		},
	});

	const checkDestMutation = createMutation({
		async mutationFn({ manager }: { manager: CredentialManager }) {
			const destClient = new Client({ handler: manager });
			return await ok(destClient.get('com.atproto.server.checkAccountStatus')) as AccountStatus;
		},
		onError(err) {
			console.error(err);
		},
	});

	const activateMutation = createMutation({
		async mutationFn({ manager }: { manager: CredentialManager }) {
			const destClient = new Client({ handler: manager });
			await ok(destClient.post('com.atproto.server.activateAccount', { as: null }));
		},
		onSuccess() {
			const dest = destination();
			if (dest?.manager) {
				checkDestMutation.mutate({ manager: dest.manager });
			}
		},
		onError(err) {
			console.error(err);
		},
	});

	const deactivateMutation = createMutation({
		async mutationFn({ manager }: { manager: CredentialManager }) {
			if (!confirm('Are you sure you want to deactivate your source account? This will prevent the old PDS from serving your data.')) {
				throw new Error('Cancelled');
			}
			const sourceClient = new Client({ handler: manager });
			await ok(sourceClient.post('com.atproto.server.deactivateAccount', { as: null, input: {} }));
		},
		onSuccess() {
			const src = source();
			if (src?.manager) {
				checkSourceMutation.mutate({ manager: src.manager });
			}
		},
		onError(err) {
			if (err instanceof Error && err.message === 'Cancelled') return;
			console.error(err);
		},
	});

	const renderStatus = (status: AccountStatus) => (
		<div class="space-y-1 text-sm">
			<p>
				<span class="text-gray-500">Status:</span>{' '}
				<StatusBadge variant={status.activated ? 'success' : 'idle'}>
					{status.activated ? 'Active' : 'Deactivated'}
				</StatusBadge>
			</p>
			<p>
				<span class="text-gray-500">Records:</span>{' '}
				<span class="font-mono">{status.indexedRecords}</span>
			</p>
			<p>
				<span class="text-gray-500">Blobs:</span>{' '}
				<span class="font-mono">{status.importedBlobs}/{status.expectedBlobs}</span>
			</p>
			<p>
				<span class="text-gray-500">Repo blocks:</span>{' '}
				<span class="font-mono">{status.repoBlocks}</span>
			</p>
		</div>
	);

	return (
		<Accordion title="Account Status">
			<Subsection title="Source account">
				<Show
					when={source()?.manager}
					fallback={<p class="text-sm text-gray-500">Sign in to source account first.</p>}
				>
					{(manager) => (
						<>
							<div class="flex items-center gap-3">
								<Button
									variant="outline"
									onClick={() => checkSourceMutation.mutate({ manager: manager() })}
									disabled={checkSourceMutation.isPending}
								>
									{checkSourceMutation.isPending ? 'Checking...' : 'Check status'}
								</Button>
							</div>

							<Show when={checkSourceMutation.isError}>
								<p class="text-sm text-red-600">{`${checkSourceMutation.error}`}</p>
							</Show>

							<Show when={checkSourceMutation.data}>
								{(status) => (
									<>
										{renderStatus(status())}

										<Show when={status().activated}>
											<div class="mt-3">
												<Button
													variant="secondary"
													onClick={() => deactivateMutation.mutate({ manager: manager() })}
													disabled={deactivateMutation.isPending}
												>
													{deactivateMutation.isPending ? 'Deactivating...' : 'Deactivate source account'}
												</Button>
											</div>
										</Show>
									</>
								)}
							</Show>
						</>
					)}
				</Show>
			</Subsection>

			<Subsection title="Destination account">
				<Show
					when={destination()?.manager}
					fallback={<p class="text-sm text-gray-500">Sign in to destination account first.</p>}
				>
					{(manager) => (
						<>
							<div class="flex items-center gap-3">
								<Button
									variant="outline"
									onClick={() => checkDestMutation.mutate({ manager: manager() })}
									disabled={checkDestMutation.isPending}
								>
									{checkDestMutation.isPending ? 'Checking...' : 'Check status'}
								</Button>
							</div>

							<Show when={checkDestMutation.isError}>
								<p class="text-sm text-red-600">{`${checkDestMutation.error}`}</p>
							</Show>

							<Show when={checkDestMutation.data}>
								{(status) => (
									<>
										{renderStatus(status())}

										<Show when={!status().activated}>
											<div class="mt-3">
												<Button
													onClick={() => activateMutation.mutate({ manager: manager() })}
													disabled={activateMutation.isPending}
												>
													{activateMutation.isPending ? 'Activating...' : 'Activate destination account'}
												</Button>
											</div>
										</Show>
									</>
								)}
							</Show>
						</>
					)}
				</Show>
			</Subsection>

			<Show when={activateMutation.isError || deactivateMutation.isError}>
				<p class="text-sm text-red-600">
					{activateMutation.isError ? `Failed to activate: ${activateMutation.error}` : ''}
					{deactivateMutation.isError ? `Failed to deactivate: ${deactivateMutation.error}` : ''}
				</p>
			</Show>
		</Accordion>
	);
};

export default AccountStatusSection;
