import { Download, FileText, Loader2, Table2 } from "lucide-react";
import { useEffect, useState } from "react";
import { USE_MOCKS } from "@/api/client";
import { useReport } from "@/api/hooks";
import type { Clash, ClashGroup } from "@/api/types";
import { describeError } from "@/components/QueryState";
import { Button } from "@/components/ui/button";
import { BLOB_URL_TTL_MS, saveBlob } from "@/lib/download";
import { clashesToCsv } from "./queueRows";

const REPORT_CSV_NAME = "subterra-clash-report.csv";
const QUEUE_CSV_NAME = "subterra-clash-queue.csv";
const REPORT_HTML_NAME = "subterra-clash-report.html";

const outline =
	"border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-800";

/**
 * Export bar: the server inspection report (HTML / CSV, GET /api/report) and a
 * client CSV of the rows currently shown in the queue.
 */
export function ReportExport({
	shown,
	groups,
}: {
	shown: readonly Clash[];
	groups: readonly ClashGroup[];
}) {
	const report = useReport();
	/** Blob URL of the HTML report when the new tab was blocked. */
	const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

	useEffect(
		() => () => {
			if (fallbackUrl) URL.revokeObjectURL(fallbackUrl);
		},
		[fallbackUrl],
	);

	const openHtml = () => {
		setFallbackUrl(null);
		// Open the tab inside the click so popup blockers allow it; point it at
		// the report once it has loaded.
		const tab = window.open("", "_blank");
		if (tab) {
			tab.document.title = "Inspection report";
			tab.document.body.textContent = "Loading inspection report…";
		}
		report.mutate("html", {
			onSuccess: (blob) => {
				const url = URL.createObjectURL(
					blob.type ? blob : new Blob([blob], { type: "text/html" }),
				);
				if (tab && !tab.closed) {
					tab.location.href = url;
					window.setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_TTL_MS);
				} else {
					setFallbackUrl(url);
				}
			},
			onError: () => tab?.close(),
		});
	};

	const downloadCsv = () => {
		setFallbackUrl(null);
		report.mutate("csv", {
			onSuccess: (blob) => saveBlob(blob, REPORT_CSV_NAME),
		});
	};

	const downloadShown = () => {
		const csv = clashesToCsv(shown, groups);
		saveBlob(
			new Blob([csv], { type: "text/csv;charset=utf-8" }),
			QUEUE_CSV_NAME,
		);
	};

	const pending = report.isPending ? report.variables : null;
	const error = report.isError ? describeError(report.error) : null;

	return (
		<div className="flex flex-col items-end gap-1.5">
			<div className="flex flex-wrap justify-end gap-2">
				<Button
					size="sm"
					onClick={openHtml}
					disabled={USE_MOCKS || report.isPending}
				>
					{pending === "html" ? (
						<Loader2 className="size-3.5 animate-spin" aria-hidden />
					) : (
						<FileText className="size-3.5" aria-hidden />
					)}
					Export inspection report
				</Button>
				<Button
					size="sm"
					variant="outline"
					className={outline}
					onClick={downloadCsv}
					disabled={USE_MOCKS || report.isPending}
				>
					{pending === "csv" ? (
						<Loader2 className="size-3.5 animate-spin" aria-hidden />
					) : (
						<Table2 className="size-3.5" aria-hidden />
					)}
					Report CSV
				</Button>
				<Button
					size="sm"
					variant="outline"
					className={outline}
					onClick={downloadShown}
					disabled={shown.length === 0}
				>
					<Download className="size-3.5" aria-hidden />
					Export {shown.length} shown (CSV)
				</Button>
			</div>
			{USE_MOCKS && (
				<p className="text-xs text-zinc-500">
					The inspection report needs the live API (mock mode is on).
				</p>
			)}
			{fallbackUrl && (
				<p className="text-xs text-zinc-400">
					The new tab was blocked.{" "}
					<a
						href={fallbackUrl}
						target="_blank"
						rel="noopener"
						download={REPORT_HTML_NAME}
						className="text-zinc-100 underline underline-offset-2"
					>
						Download the inspection report
					</a>
				</p>
			)}
			{error && (
				<p role="alert" className="text-xs text-zinc-300">
					{error.detail}{" "}
					<code className="font-mono text-zinc-500">{error.code}</code>
				</p>
			)}
		</div>
	);
}
