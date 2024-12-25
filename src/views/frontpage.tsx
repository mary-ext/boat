import { Component, ComponentProps } from 'solid-js';

import { useTitle } from '~/lib/navigation/router';

import HistoryIcon from '~/components/ic-icons/baseline-history';
import KeyIcon from '~/components/ic-icons/baseline-key';
import KeyVisualizerIcon from '~/components/ic-icons/baseline-key-visualizer';
import AdminPanelSettingsOutlinedIcon from '~/components/ic-icons/outline-admin-panel-settings';
import ArchiveOutlinedIcon from '~/components/ic-icons/outline-archive';
import BookmarksOutlinedIcon from '~/components/ic-icons/outline-bookmarks';
import DirectionsCarOutlinedIcon from '~/components/ic-icons/outline-directions-car';
import ExploreOutlinedIcon from '~/components/ic-icons/outline-explore';
import MoveUpOutlinedIcon from '~/components/ic-icons/outline-move-up';
import VisibilityOutlinedIcon from '~/components/ic-icons/outline-visibility';

interface Group {
	name: string;
	items: Item[];
}

interface Item {
	name: string;
	description: string;
	href: string | null;
	icon?: Component<ComponentProps<'svg'>>;
}

const Frontpage = () => {
	const catalogue: Group[] = [
		{
			name: `Identity`,
			items: [
				{
					name: `View identity info`,
					description: `Look up an account's DID document`,
					href: '/did-lookup',
					icon: VisibilityOutlinedIcon,
				},
				{
					name: `View PLC operation logs`,
					description: `Show history of a did:plc identity`,
					href: '/plc-oplogs',
					icon: HistoryIcon,
				},
				{
					name: `Apply PLC operations`,
					description: `Submit operations to your did:plc identity`,
					href: `/plc-applicator`,
					icon: AdminPanelSettingsOutlinedIcon,
				},
			],
		},
		{
			name: `Repository`,
			items: [
				{
					name: `Export repository`,
					description: `Download an archive of an account's repository`,
					href: '/repo-export',
					icon: ArchiveOutlinedIcon,
				},
				{
					name: `Unpack CAR file`,
					description: `Extract a repository archive into a tarball`,
					href: '/car-unpack',
					icon: DirectionsCarOutlinedIcon,
				},
				{
					name: `Repository explorer`,
					description: `Explore an account's public records`,
					href: null,
					icon: ExploreOutlinedIcon,
				},
			],
		},
		{
			name: `Blobs`,
			items: [
				{
					name: `Export blobs`,
					description: `Download all blobs from an account into a tarball`,
					href: '/blob-export',
					icon: ArchiveOutlinedIcon,
				},
			],
		},
		{
			name: `Labeling`,
			items: [
				{
					name: `View emitted labels`,
					description: `Show moderation actions taken by a labeler`,
					href: null,
					icon: BookmarksOutlinedIcon,
				},
			],
		},
		{
			name: `Account`,
			items: [
				{
					name: `Migrate account`,
					description: `Move your account data to another server`,
					href: null,
					icon: MoveUpOutlinedIcon,
				},
			],
		},
		{
			name: `Cryptography`,
			items: [
				{
					name: `Generate secret keys`,
					description: `Create a new secp256k1/nistp256 keypair`,
					href: `/crypto-generate`,
					icon: KeyIcon,
				},
				{
					name: `View crypto key info`,
					description: `Show basic metadata about a public or private key`,
					href: null,
					icon: KeyVisualizerIcon,
				},
			],
		},
	];

	const nodes = catalogue.map(({ name: groupName, items }) => {
		const childNodes = items.map(({ name: itemName, description, href, icon: Icon }) => {
			return (
				<a
					href={href || undefined}
					class={
						`flex select-none gap-4 px-4 py-3` +
						(href ? ` hover:bg-gray-50 active:bg-gray-100` : ` opacity-40`)
					}
				>
					<div class="grid h-10 w-10 shrink-0 place-items-center rounded bg-purple-100 text-purple-600">
						{Icon && <Icon class="h-5 w-5" />}
					</div>
					<div class="grow">
						<p class="font-semibold">{itemName + (!href ? ` (wip)` : ``)}</p>
						<p class="text-pretty text-[13px] leading-5 text-gray-600">{description}</p>
					</div>
				</a>
			);
		});

		return (
			<>
				<p class="px-4 pb-1 pt-4 text-[13px] font-semibold leading-5 text-purple-800">{groupName}</p>
				{childNodes}
			</>
		);
	});

	useTitle(() => `boat`);

	return (
		<>
			<div class="p-4">
				<h1 class="text-lg font-bold text-purple-800">boat</h1>
				<p class="text-gray-600">handy online tools for AT Protocol</p>
			</div>
			<hr class="mx-4 border-gray-300" />

			<div class="flex grow flex-col pb-2">{nodes}</div>

			<hr class="mx-4 border-gray-300" />
			<div class="p-4 pb-8">
				<a href="https://github.com/mary-ext/boat" class="font-medium text-purple-800 underline">
					source code
				</a>
			</div>
		</>
	);
};

export default Frontpage;
