import * as v from '@badrap/valita';

import { defs, type UnsignedOperation } from '@atcute/did-plc';

import type { ToValidator } from '../utils/valita';
import { serviceUrlString } from './strings';

const _unsignedOperation = defs.unsignedOperation as ToValidator<UnsignedOperation>;

export const updatePayload = _unsignedOperation.omit('type', 'prev').extend({
	services: v
		.record(
			defs.service.chain((input) => {
				switch (input.type) {
					case 'AtprotoPersonalDataServer':
					case 'AtprotoLabeler':
					case 'BskyFeedGenerator':
					case 'BskyNotificationService': {
						const endpoint = input.endpoint;
						const result = serviceUrlString.try(endpoint);

						if (!result.ok) {
							return v.err({
								message: `must be a valid atproto service url`,
								path: ['endpoint'],
							});
						}

						const trimmed = endpoint.replace(/\/$/, '');

						if (endpoint !== trimmed) {
							return v.ok({ ...input, endpoint: trimmed });
						}
					}
				}

				return v.ok(input);
			}),
		)
		.chain((input) => {
			const length = Object.keys(input).length;

			if (length > 10) {
				return v.err(`too many service entries (max 10)`);
			}

			for (const id in input) {
				if (id.length > 32) {
					return v.err({
						message: `service id too long (max 32 characters)`,
						path: [id],
					});
				}
			}

			return v.ok(input);
		}),
});

export type UpdatePayload = v.Infer<typeof updatePayload>;
