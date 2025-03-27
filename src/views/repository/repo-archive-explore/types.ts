export interface Archive {
	/** Actual CAR file */
	file: File;
	/** Collections in the CAR file */
	entries: CollectionEntry[];
}

export interface CollectionEntry {
	/** Collection name, e.g. "app.bsky.feed.post" */
	name: string;
	/** Entries under this collection */
	entries: RecordEntry[];
}

export interface RecordEntry {
	/** Record key, e.g. "3ll3hjomcxka6" */
	key: string;
	/** Record digest, e.g. "bafyreieueqsjugefehodlh4o4idd7fzik3koxno7io7x4qu3q4wofsfjl4" */
	cid: string;
	/** Start position of the record in the CAR file */
	dataStart: number;
	/** End position of the record in the CAR file */
	dataEnd: number;
}

export type View =
	| { type: 'repo' }
	| { type: 'collection'; collection: CollectionEntry }
	| { type: 'record'; collection: CollectionEntry; record: RecordEntry };
