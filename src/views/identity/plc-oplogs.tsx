import { JSX, Match, Switch } from 'solid-js';
import * as v from 'valibot';

import { At } from '@atcute/client/lexicons';

import { resolveHandleViaAppView } from '~/api/queries/handle';
import { didString, handleString, serviceUrlString } from '~/api/types/strings';
import { DID_OR_HANDLE_RE, isDid } from '~/api/utils/strings';

import { useTitle } from '~/lib/navigation/router';
import { dequal } from '~/lib/utils/dequal';
import { createQuery } from '~/lib/utils/query';
import { asIdentifier, useSearchParams } from '~/lib/utils/search-params';

import CircularProgressView from '~/components/circular-progress-view';
import DiffTable from '~/components/diff-table';
import ErrorView from '~/components/error-view';

const PlcOperationLogPage = () => {
	const [params, setParams] = useSearchParams({
		q: asIdentifier,
	});

	const query = createQuery(
		() => params.q,
		async (identifier, signal) => {
			let did: At.DID;
			if (isDid(identifier)) {
				did = identifier;
			} else {
				did = await resolveHandleViaAppView({ handle: identifier, signal });
			}

			if (!did.startsWith('did:plc:')) {
				throw new Error(`${did} is not plc`);
			}

			const response = await fetch(`https://plc.directory/${did}/log/audit`);
			if (!response.ok) {
				throw new Error(`got resposne ${response.status}`);
			}

			const json = await response.json();
			return v.parse(plcLogEntries, json);
		},
	);

	useTitle(() => {
		const ident = params.q;
		return `View PLC operation logs` + (ident ? ` — ${ident}` : ``) + ` — boat`;
	});

	return (
		<>
			<div class="p-4">
				<h1 class="text-lg font-bold text-purple-800">View PLC operation logs</h1>
				<p class="text-gray-600">Show history of a did:plc identity</p>
			</div>
			<hr class="mx-4 border-gray-200" />

			<form
				onSubmit={(ev) => {
					const formData = new FormData(ev.currentTarget);
					ev.preventDefault();

					const ident = formData.get('ident') as string;
					setParams({ q: ident });
				}}
				class="m-4 flex flex-col gap-4"
			>
				<label class="flex flex-col gap-2">
					<span class="font-semibold text-gray-600">Handle or DID identifier*</span>
					<input
						ref={(node) => {
							if (!params.q) {
								setTimeout(() => node.focus(), 1);
							}
						}}
						type="text"
						name="ident"
						required
						pattern={DID_OR_HANDLE_RE.source}
						placeholder="paul.bsky.social"
						value={params.q ?? ''}
						class="rounded border border-gray-300 px-3 py-2 text-sm outline-2 -outline-offset-1 outline-purple-600 placeholder:text-gray-400 focus:outline"
					/>
				</label>

				<div>
					<button
						type="submit"
						class="flex h-9 select-none items-center rounded bg-purple-800 px-4 text-sm font-semibold text-white hover:bg-purple-700 active:bg-purple-700"
					>
						Look up!
					</button>
				</div>
			</form>

			<hr class="mx-4 border-gray-200" />

			<Switch>
				<Match when={query.isPending}>
					<CircularProgressView />
				</Match>

				<Match when={query.isError}>
					<ErrorView error={query.error} onRetry={query.refetch} />
				</Match>

				<Match when={query.data} keyed>
					{(plcLogs) => {
						const lastActiveEntry = plcLogs.findLast((entry) => !entry.nullified);

						const opHistory = createOperationHistory(plcLogs).reverse();
						const grouped = Array.from(groupBy(opHistory, (item) => item.orig));

						const renderDiffItem = (diff: DiffEntry) => {
							const nullified = diff.orig.nullified;

							let title = 'Unknown log entry';
							let node: JSX.Element;

							if (diff.type === 'account_created') {
								title = `Account created`;
							} else if (diff.type === 'account_tombstoned') {
								title = `Account tombstoned`;
							} else if (diff.type === 'handle_added') {
								const handle = diff.handle;

								title = `Alias added`;
								node = <DiffTable fields={[{ title: `URI`, prev: null, next: handle }]} />;
							} else if (diff.type === 'handle_changed') {
								const prevHandle = diff.prev_handle;
								const nextHandle = diff.next_handle;

								title = `Alias updated`;
								node = <DiffTable fields={[{ title: `URI`, prev: prevHandle, next: nextHandle }]} />;
							} else if (diff.type === 'handle_removed') {
								const handle = diff.handle;

								title = `Alias removed`;
								node = <DiffTable fields={[{ title: `URI`, prev: handle, next: null }]} />;
							} else if (diff.type === 'rotation_key_added') {
								const key = diff.rotation_key;

								title = `Rotation key added`;
								node = <DiffTable fields={[{ title: `Key`, prev: null, next: key }]} />;
							} else if (diff.type === 'rotation_key_removed') {
								const key = diff.rotation_key;

								title = `Rotation key removed`;
								node = <DiffTable fields={[{ title: `Key`, prev: key, next: null }]} />;
							} else if (diff.type === 'service_added') {
								const id = diff.service_id;
								const type = diff.service_type;
								const endpoint = diff.service_endpoint;

								title = `Service added`;
								node = (
									<DiffTable
										fields={[
											{ title: `ID`, prev: null, next: id },
											{ title: `Type`, prev: null, next: type },
											{ title: `Endpoint`, prev: null, next: endpoint },
										]}
									/>
								);
							} else if (diff.type === 'service_changed') {
								const id = diff.service_id;

								const prevType = diff.prev_service_type;
								const prevEndpoint = diff.prev_service_endpoint;

								const nextType = diff.next_service_type;
								const nextEndpoint = diff.next_service_endpoint;

								title = `Service updated`;
								node = (
									<DiffTable
										fields={[
											{ title: `ID`, next: id },
											{ title: `Type`, prev: prevType, next: nextType },
											{ title: `Endpoint`, prev: prevEndpoint, next: nextEndpoint },
										]}
									/>
								);
							} else if (diff.type === 'service_removed') {
								const id = diff.service_id;
								const type = diff.service_type;
								const endpoint = diff.service_endpoint;

								title = `Service removed`;
								node = (
									<DiffTable
										fields={[
											{ title: `ID`, prev: id, next: null },
											{ title: `Type`, prev: type, next: null },
											{ title: `Endpoint`, prev: endpoint, next: null },
										]}
									/>
								);
							} else if (diff.type === 'verification_method_added') {
								const id = diff.method_id;
								const key = diff.method_key;

								title = `Verification method added`;
								node = (
									<DiffTable
										fields={[
											{ title: `ID`, prev: null, next: id },
											{ title: `Key`, prev: null, next: key },
										]}
									/>
								);
							} else if (diff.type === 'verification_method_changed') {
								const id = diff.method_id;

								const prevKey = diff.prev_method_key;
								const nextKey = diff.next_method_key;

								title = `Verification method updated`;

								node = (
									<DiffTable
										fields={[
											{ title: `ID`, next: id },
											{ title: `Key`, prev: prevKey, next: nextKey },
										]}
									/>
								);
							} else if (diff.type === 'verification_method_removed') {
								const id = diff.method_id;
								const key = diff.method_key;

								title = `Verification method removed`;
								node = (
									<DiffTable
										fields={[
											{ title: `ID`, prev: id, next: null },
											{ title: `Key`, prev: key, next: null },
										]}
									/>
								);
							}

							return (
								<div class="flex min-w-0 grow flex-col gap-1 py-2">
									<p class={`font-bold` + (!nullified ? ` ` : ` text-gray-600 line-through`)}>{title}</p>
									{node}
								</div>
							);
						};

						return (
							<ol class="break-words px-4">
								{grouped.map(([entry, diffs], idx) => {
									const last = idx === grouped.length - 1;
									const lastActive = entry === lastActiveEntry;

									const nullified = entry.nullified;
									const multiple = diffs.length > 1;

									const node = multiple ? (
										<ol>
											{diffs.map((diff, idx) => {
												const last = idx === diffs.length - 1;

												return (
													<li class="flex gap-4">
														<div class="relative flex flex-col items-center">
															<div class="mt-3.5 h-2 w-2 rounded-full bg-gray-600" />

															{!last && (
																<div class="absolute bottom-[-0.875rem] top-[1.375rem] border-l border-gray-300" />
															)}
														</div>
														{/* @once */ renderDiffItem(diff)}
													</li>
												);
											})}
										</ol>
									) : diffs.length === 1 ? (
										renderDiffItem(diffs[0])
									) : null;

									return (
										<li class="flex gap-4">
											<div class="relative flex flex-col items-center">
												<div
													class={
														`mt-[1.375rem] h-2 w-2 rounded-full` +
														(lastActive ? ` bg-purple-600` : ` bg-gray-600`)
													}
												/>

												{!last && (
													<div class="absolute bottom-[-1.875rem] top-[1.875rem] border-l border-gray-300" />
												)}
												{multiple && (
													<div class="absolute left-1 top-[1.875rem] h-[1.5rem] w-[1.375rem] rounded-bl-2xl border-b border-l border-gray-300" />
												)}
											</div>

											<div class="flex min-w-0 grow flex-col py-4">
												<p class="font-mono text-[0.8125rem] leading-5 text-gray-600">
													<span class={!nullified ? `` : `line-through`}>{/* @once */ entry.createdAt}</span>
													{nullified && <span> (nullified)</span>}
												</p>

												{node}
											</div>
										</li>
									);
								})}
							</ol>
						);
					}}
				</Match>
			</Switch>
		</>
	);
};

export default PlcOperationLogPage;

const groupBy = <K, T>(items: T[], keyFn: (item: T, index: number) => K): Map<K, T[]> => {
	const map = new Map<K, T[]>();

	for (let idx = 0, len = items.length; idx < len; idx++) {
		const val = items[idx];
		const key = keyFn(val, idx);

		const list = map.get(key);

		if (list !== undefined) {
			list.push(val);
		} else {
			map.set(key, [val]);
		}
	}

	return map;
};

type DiffEntry =
	| {
			type: 'account_created';
			orig: PlcLogEntry;
			nullified: boolean;
			at: string;
			rotationKeys: string[];
			verificationMethods: Record<string, string>;
			alsoKnownAs: string[];
			services: Record<string, { type: string; endpoint: string }>;
	  }
	| {
			type: 'account_tombstoned';
			orig: PlcLogEntry;
			nullified: boolean;
			at: string;
	  }
	| {
			type: 'rotation_key_added';
			orig: PlcLogEntry;
			nullified: boolean;
			at: string;
			rotation_key: string;
	  }
	| {
			type: 'rotation_key_removed';
			orig: PlcLogEntry;
			nullified: boolean;
			at: string;
			rotation_key: string;
	  }
	| {
			type: 'verification_method_added';
			orig: PlcLogEntry;
			nullified: boolean;
			at: string;
			method_id: string;
			method_key: string;
	  }
	| {
			type: 'verification_method_removed';
			orig: PlcLogEntry;
			nullified: boolean;
			at: string;
			method_id: string;
			method_key: string;
	  }
	| {
			type: 'verification_method_changed';
			orig: PlcLogEntry;
			nullified: boolean;
			at: string;
			method_id: string;
			prev_method_key: string;
			next_method_key: string;
	  }
	| {
			type: 'handle_added';
			orig: PlcLogEntry;
			nullified: boolean;
			at: string;
			handle: string;
	  }
	| {
			type: 'handle_removed';
			orig: PlcLogEntry;
			nullified: boolean;
			at: string;
			handle: string;
	  }
	| {
			type: 'handle_changed';
			orig: PlcLogEntry;
			nullified: boolean;
			at: string;
			prev_handle: string;
			next_handle: string;
	  }
	| {
			type: 'service_added';
			orig: PlcLogEntry;
			nullified: boolean;
			at: string;
			service_id: string;
			service_type: string;
			service_endpoint: string;
	  }
	| {
			type: 'service_removed';
			orig: PlcLogEntry;
			nullified: boolean;
			at: string;
			service_id: string;
			service_type: string;
			service_endpoint: string;
	  }
	| {
			type: 'service_changed';
			orig: PlcLogEntry;
			nullified: boolean;
			at: string;
			service_id: string;
			prev_service_type: string;
			next_service_type: string;
			prev_service_endpoint: string;
			next_service_endpoint: string;
	  };

const createOperationHistory = (entries: PlcLogEntry[]): DiffEntry[] => {
	const history: DiffEntry[] = [];

	for (let idx = 0, len = entries.length; idx < len; idx++) {
		const entry = entries[idx];
		const op = entry.operation;

		if (op.type === 'create') {
			history.push({
				type: 'account_created',
				orig: entry,
				nullified: entry.nullified,
				at: entry.createdAt,
				rotationKeys: [op.recoveryKey, op.signingKey],
				verificationMethods: { atproto: op.signingKey },
				alsoKnownAs: [`at://${op.handle}`],
				services: {
					atproto_pds: {
						type: 'AtprotoPersonalDataServer',
						endpoint: op.service,
					},
				},
			});
		} else if (op.type === 'plc_operation') {
			const prevOp = findLastMatching(entries, (entry) => !entry.nullified, idx - 1)?.operation;

			let oldRotationKeys: string[];
			let oldVerificationMethods: Record<string, string>;
			let oldAlsoKnownAs: string[];
			let oldServices: Record<string, Service>;

			if (!prevOp) {
				history.push({
					type: 'account_created',
					orig: entry,
					nullified: entry.nullified,
					at: entry.createdAt,
					rotationKeys: op.rotationKeys,
					verificationMethods: op.verificationMethods,
					alsoKnownAs: op.alsoKnownAs,
					services: op.services,
				});

				continue;
			} else if (prevOp.type === 'create') {
				oldRotationKeys = [prevOp.recoveryKey, prevOp.signingKey];
				oldVerificationMethods = { atproto: prevOp.signingKey };
				oldAlsoKnownAs = [`at://${prevOp.handle}`];
				oldServices = {
					atproto_pds: {
						type: 'AtprotoPersonalDataServer',
						endpoint: prevOp.service,
					},
				};
			} else if (prevOp.type === 'plc_operation') {
				oldRotationKeys = prevOp.rotationKeys;
				oldVerificationMethods = prevOp.verificationMethods;
				oldAlsoKnownAs = prevOp.alsoKnownAs;
				oldServices = prevOp.services;
			} else {
				continue;
			}

			// Check for rotation key changes
			{
				const additions = difference(op.rotationKeys, oldRotationKeys);
				const removals = difference(oldRotationKeys, op.rotationKeys);

				for (const key of additions) {
					history.push({
						type: 'rotation_key_added',
						orig: entry,
						nullified: entry.nullified,
						at: entry.createdAt,
						rotation_key: key,
					});
				}

				for (const key of removals) {
					history.push({
						type: 'rotation_key_removed',
						orig: entry,
						nullified: entry.nullified,
						at: entry.createdAt,
						rotation_key: key,
					});
				}
			}

			// Check for verification method changes
			{
				for (const id in op.verificationMethods) {
					if (!(id in oldVerificationMethods)) {
						history.push({
							type: 'verification_method_added',
							orig: entry,
							nullified: entry.nullified,
							at: entry.createdAt,
							method_id: id,
							method_key: op.verificationMethods[id],
						});
					} else if (op.verificationMethods[id] !== oldVerificationMethods[id]) {
						history.push({
							type: 'verification_method_changed',
							orig: entry,
							nullified: entry.nullified,
							at: entry.createdAt,
							method_id: id,
							prev_method_key: oldVerificationMethods[id],
							next_method_key: op.verificationMethods[id],
						});
					}
				}

				for (const id in oldVerificationMethods) {
					if (!(id in op.verificationMethods)) {
						history.push({
							type: 'verification_method_removed',
							orig: entry,
							nullified: entry.nullified,
							at: entry.createdAt,
							method_id: id,
							method_key: oldVerificationMethods[id],
						});
					}
				}
			}

			// Check for handle changes
			if (op.alsoKnownAs.length === 1 && oldAlsoKnownAs.length === 1) {
				if (op.alsoKnownAs[0] !== oldAlsoKnownAs[0]) {
					history.push({
						type: 'handle_changed',
						orig: entry,
						nullified: entry.nullified,
						at: entry.createdAt,
						prev_handle: oldAlsoKnownAs[0],
						next_handle: op.alsoKnownAs[0],
					});
				}
			} else {
				const additions = difference(op.alsoKnownAs, oldAlsoKnownAs);
				const removals = difference(oldAlsoKnownAs, op.alsoKnownAs);

				for (const handle of additions) {
					history.push({
						type: 'handle_added',
						orig: entry,
						nullified: entry.nullified,
						at: entry.createdAt,
						handle: handle,
					});
				}

				for (const handle of removals) {
					history.push({
						type: 'handle_removed',
						orig: entry,
						nullified: entry.nullified,
						at: entry.createdAt,
						handle: handle,
					});
				}
			}

			// Check for service changes
			{
				for (const id in op.services) {
					if (!(id in oldServices)) {
						history.push({
							type: 'service_added',
							orig: entry,
							nullified: entry.nullified,
							at: entry.createdAt,
							service_id: id,
							service_type: op.services[id].type,
							service_endpoint: op.services[id].endpoint,
						});
					} else if (!dequal(op.services[id], oldServices[id])) {
						history.push({
							type: 'service_changed',
							orig: entry,
							nullified: entry.nullified,
							at: entry.createdAt,
							service_id: id,
							prev_service_type: oldServices[id].type,
							next_service_type: op.services[id].type,
							prev_service_endpoint: oldServices[id].endpoint,
							next_service_endpoint: op.services[id].endpoint,
						});
					}
				}

				for (const id in oldServices) {
					if (!(id in op.services)) {
						history.push({
							type: 'service_removed',
							orig: entry,
							nullified: entry.nullified,
							at: entry.createdAt,
							service_id: id,
							service_type: oldServices[id].type,
							service_endpoint: oldServices[id].endpoint,
						});
					}
				}
			}
		} else if (op.type === 'plc_tombstone') {
			history.push({
				type: 'account_tombstoned',
				orig: entry,
				nullified: entry.nullified,
				at: entry.createdAt,
			});
		}
	}

	return history;
};

const didKeyString = v.pipe(
	v.string(),
	v.check((str) => str.startsWith('did:key:')),
);

const legacyGenesisOp = v.object({
	type: v.literal('create'),
	signingKey: didKeyString,
	recoveryKey: didKeyString,
	handle: handleString,
	service: serviceUrlString,
	prev: v.null(),
	sig: v.string(),
});

const tombstoneOp = v.object({
	type: v.literal('plc_tombstone'),
	prev: v.string(),
	sig: v.string(),
});

const service = v.object({
	type: v.string(),
	endpoint: v.pipe(v.string(), v.url()),
});
type Service = v.InferOutput<typeof service>;

const plcOp = v.object({
	type: v.literal('plc_operation'),
	rotationKeys: v.array(didKeyString),
	verificationMethods: v.record(v.string(), didKeyString),
	alsoKnownAs: v.array(v.pipe(v.string(), v.url())),
	services: v.record(
		v.string(),
		v.object({
			type: v.string(),
			endpoint: v.pipe(v.string(), v.url()),
		}),
	),
	prev: v.nullable(v.string()),
	sig: v.string(),
});

const plcOperation = v.union([legacyGenesisOp, tombstoneOp, plcOp]);

const plcLogEntry = v.object({
	did: didString,
	cid: v.string(),
	operation: plcOperation,
	nullified: v.boolean(),
	createdAt: v.pipe(
		v.string(),
		v.check((dateString) => {
			const date = new Date(dateString);
			return !Number.isNaN(date.getTime());
		}),
	),
});
type PlcLogEntry = v.InferOutput<typeof plcLogEntry>;

const plcLogEntries = v.array(plcLogEntry);

function findLastMatching<T, S extends T>(
	arr: T[],
	predicate: (item: T) => item is S,
	start?: number,
): S | undefined;
function findLastMatching<T>(arr: T[], predicate: (item: T) => boolean, start?: number): T | undefined;
function findLastMatching<T>(
	arr: T[],
	predicate: (item: T) => boolean,
	start: number = arr.length - 1,
): T | undefined {
	for (let i = start, v: any; i >= 0; i--) {
		if (predicate((v = arr[i]))) {
			return v;
		}
	}

	return undefined;
}

function difference<T>(a: readonly T[], b: readonly T[]): T[] {
	const set = new Set(b);
	return a.filter((value) => !set.has(value));
}
