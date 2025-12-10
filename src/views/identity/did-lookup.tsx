import { Match, Switch } from 'solid-js';

import { isAtprotoDid } from '@atcute/identity';
import { isHandle, type AtprotoDid, type Did, type Handle } from '@atcute/lexicons/syntax';

import { getDidDocument } from '~/api/queries/did-doc';
import { resolveHandleViaAppView } from '~/api/queries/handle';
import { isServiceUrlString } from '~/api/types/strings';

import { useTitle } from '~/lib/navigation/router';
import { createQuery } from '~/lib/utils/query';
import { asIdentifier, useSearchParams } from '~/lib/utils/search-params';

import CircularProgressView from '~/components/circular-progress-view';
import ErrorView from '~/components/error-view';
import Button from '~/components/inputs/button';
import TextInput from '~/components/inputs/text-input';
import PageHeader from '~/components/page-header';

const DidLookupPage = () => {
	const [params, setParams] = useSearchParams({
		q: asIdentifier,
	});

	const query = createQuery(
		() => params.q,
		async (identifier, signal) => {
			let did: AtprotoDid;
			if (isAtprotoDid(identifier)) {
				did = identifier;
			} else if (isHandle(identifier)) {
				did = await resolveHandleViaAppView({ handle: identifier, signal });
			} else {
				throw new Error(`Invalid identifier`);
			}

			const doc = await getDidDocument({ did, signal });

			return doc;
		},
	);

	useTitle(() => {
		const ident = params.q;
		return `View identity info` + (ident ? ` — ${ident}` : ``) + ` — boat`;
	});

	return (
		<>
			<PageHeader title="View identity info" subtitle="Look up an account's DID document" />

			<form
				onSubmit={(ev) => {
					const formData = new FormData(ev.currentTarget);
					ev.preventDefault();

					const ident = formData.get('ident') as Did | Handle;
					setParams({ q: ident });
				}}
				class="m-4 flex flex-col gap-4"
			>
				<TextInput
					label="Handle or DID identifier*"
					type="text"
					name="ident"
					autocomplete="username"
					placeholder="paul.bsky.social"
					autofocus
				/>

				<div>
					<Button type="submit">Look up!</Button>
				</div>
			</form>
			<hr class="mx-4 border-gray-300" />

			<Switch>
				<Match when={query.isPending}>
					<CircularProgressView />
				</Match>

				<Match when={query.isError}>
					<ErrorView error={query.error} onRetry={query.refetch} />
				</Match>

				<Match when={query.data} keyed>
					{(doc) => {
						const isDidPlc = doc.id.startsWith('did:plc:');

						return (
							<>
								<div class="flex flex-col gap-6 break-words p-4 text-gray-900">
									<div>
										<p class="font-semibold text-gray-600">DID identifier</p>
										<span>{doc.id}</span>
									</div>

									<div>
										<p class="font-semibold text-gray-600">Identifies as</p>
										<ol class="list-disc pl-4">
											{doc.alsoKnownAs?.map((ident) => (
												<li>{ident}</li>
											))}
										</ol>
									</div>

									<div>
										<p class="font-semibold text-gray-600">Services</p>
										<ol class="list-disc pl-4">
											{doc.service?.map(({ id, type, serviceEndpoint }, idx) => {
												const isString = typeof serviceEndpoint === 'string';
												const isURL = isString && URL.canParse('' + serviceEndpoint);
												const isServiceUrl = isString && isServiceUrlString(serviceEndpoint);

												const isPDS = type === 'AtprotoPersonalDataServer';
												const isLabeler = type === 'AtprotoLabeler';

												return (
													<li class={idx !== 0 ? `mt-3` : ``}>
														<p class="font-medium">{id}</p>
														<p class="text-gray-600">{type}</p>

														{isURL ? (
															<a target="_blank" href={serviceEndpoint} class="text-purple-600 underline">
																{serviceEndpoint}
															</a>
														) : isString ? (
															<p class="text-gray-600">{serviceEndpoint}</p>
														) : null}

														<div class="mt-2 flex flex-wrap gap-2 empty:hidden">
															{isPDS && isServiceUrl && (
																<Button variant="outline" disabled>
																	View PDS info
																</Button>
															)}

															{isPDS && isServiceUrl && (
																<Button variant="outline" disabled>
																	Explore account repository
																</Button>
															)}

															{isLabeler && isServiceUrl && (
																<Button variant="outline" disabled>
																	View emitted labels
																</Button>
															)}
														</div>
													</li>
												);
											})}
										</ol>
									</div>

									<div>
										<p class="font-semibold text-gray-600">Verification methods</p>
										<ol class="list-disc pl-4">
											{doc.verificationMethod?.map(({ id, type, publicKeyMultibase }, idx) => {
												return (
													<li class={idx !== 0 ? `mt-3` : ``}>
														<p class="font-medium">{id.replace(doc.id, '')}</p>
														<p class="text-gray-600">{type}</p>

														{publicKeyMultibase && (
															<p class="font-mono text-gray-600">{publicKeyMultibase}</p>
														)}
													</li>
												);
											})}
										</ol>
									</div>
								</div>

								<div class="flex flex-wrap gap-4 p-4 pt-2">
									<Button
										variant="outline"
										onClick={() => {
											navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
										}}
									>
										Copy DID document
									</Button>

									{isDidPlc && (
										<Button variant="outline" href={`/plc-oplogs?q=${params.q!}`}>
											View PLC operation logs
										</Button>
									)}
								</div>
							</>
						);
					}}
				</Match>
			</Switch>
		</>
	);
};

export default DidLookupPage;
