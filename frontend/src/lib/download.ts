/** How long a blob URL handed to the browser stays valid. */
export const BLOB_URL_TTL_MS = 60_000;

/** Save a Blob as a file via a temporary link; the URL is revoked afterwards. */
export function saveBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.rel = "noopener";
	document.body.append(link);
	link.click();
	link.remove();
	// Revoking straight after click() can cancel the download in some browsers.
	window.setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_TTL_MS);
}
