import type { JSX } from 'solid-js';

import { createDropZone, type CreateDropZoneOptions } from '~/lib/hooks/dropzone';

import Button from './inputs/button';

interface FileDropZoneProps {
	accept?: string;
	disabled?: boolean;
	onFiles: (files: File[]) => void;
	dataTypes?: CreateDropZoneOptions['dataTypes'];
	multiple?: boolean;
	children?: JSX.Element;
}

const FileDropZone = (props: FileDropZoneProps) => {
	const { ref: dropRef, isDropping } = createDropZone({
		dataTypes: props.dataTypes,
		multiple: props.multiple ?? false,
		onDrop(files) {
			if (files) {
				props.onFiles(files);
			}
		},
	});

	const handleBrowse = () => {
		const input = document.createElement('input');
		input.type = 'file';
		if (props.accept) {
			input.accept = props.accept;
		}
		if (props.multiple) {
			input.multiple = true;
		}
		input.oninput = () => {
			const files = Array.from(input.files!);
			if (files.length > 0) {
				props.onFiles(files);
			}
		};
		input.click();
	};

	return (
		<fieldset
			ref={dropRef}
			disabled={props.disabled}
			class={
				`relative grid place-items-center rounded border border-gray-300 px-6 py-12 disabled:opacity-50` +
				(props.disabled || !isDropping() ? ` bg-gray-100` : ` bg-green-100`)
			}
		>
			<div class="flex flex-col items-center gap-4">
				<Button variant="outline" onClick={handleBrowse}>
					Browse files
				</Button>
				<p class="select-none font-medium text-gray-600">or drop your file here</p>
			</div>
			{props.children}
		</fieldset>
	);
};

export default FileDropZone;
