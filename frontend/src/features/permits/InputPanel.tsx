import { FileText, Loader2, Upload } from "lucide-react";
import { type DragEvent, useId, useRef, useState } from "react";
import { type ParseInput, usePermitSamples } from "@/api/hooks";
import { describeError } from "@/components/QueryState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** API_CONTRACT: PDF ≤ 5 MB (the server answers 413 FILE_TOO_LARGE above it). */
const MAX_PDF_BYTES = 5 * 1024 * 1024;

function isPdf(file: File): boolean {
	return (
		file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
	);
}

/** Paste box, PDF drop zone and the demo sample buttons. */
export function InputPanel({
	onParse,
	pending,
	error,
}: {
	onParse: (input: ParseInput) => void;
	pending: boolean;
	error: unknown;
}) {
	const samples = usePermitSamples();
	const [text, setText] = useState("");
	const [dragOver, setDragOver] = useState(false);
	const [fileError, setFileError] = useState<string | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const textId = useId();

	const takeFile = (file: File | undefined) => {
		if (!file) return;
		if (!isPdf(file)) {
			setFileError(`${file.name} is not a PDF.`);
			return;
		}
		if (file.size > MAX_PDF_BYTES) {
			setFileError(
				`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 5 MB.`,
			);
			return;
		}
		setFileError(null);
		onParse({ file });
	};

	const onDrop = (e: DragEvent<HTMLButtonElement>) => {
		e.preventDefault();
		setDragOver(false);
		takeFile(e.dataTransfer.files[0]);
	};

	const serverError = error ? describeError(error) : null;

	return (
		<section className="flex flex-col gap-3">
			<div className="flex flex-col gap-1.5">
				<h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
					Demo permits
				</h2>
				{samples.isPending ? (
					<p className="flex items-center gap-2 text-xs text-zinc-500">
						<Loader2 className="size-3 animate-spin" aria-hidden />
						Loading samples…
					</p>
				) : samples.isError ? (
					<p className="text-xs text-zinc-400">
						Samples unavailable: {describeError(samples.error).detail}{" "}
						<button
							type="button"
							className="underline underline-offset-2 hover:text-zinc-100"
							onClick={() => samples.refetch()}
						>
							Retry
						</button>
					</p>
				) : (
					<div className="flex flex-wrap gap-2">
						{samples.data.items.map((s) => (
							<Button
								key={s.id}
								size="sm"
								variant="outline"
								disabled={pending}
								className="h-auto max-w-full justify-start whitespace-normal border-zinc-700 bg-transparent py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
								onClick={() => {
									setText(s.text);
									onParse({ text: s.text });
								}}
							>
								<FileText className="size-3.5 shrink-0" aria-hidden />
								{s.title}
							</Button>
						))}
					</div>
				)}
			</div>

			<label
				htmlFor={textId}
				className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500"
			>
				Paste permit text
				<Textarea
					id={textId}
					value={text}
					onChange={(e) => setText(e.target.value)}
					placeholder="e.g. NVVN Discom — permit 2026/STN/114. Lay 11kV cable by open trench along north side of Station Road…"
					className="min-h-24 border-zinc-700 bg-zinc-900 text-sm font-normal normal-case tracking-normal text-zinc-100"
				/>
			</label>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					size="sm"
					disabled={pending}
					onClick={() => onParse({ text })}
					className="bg-zinc-100 text-zinc-900 hover:bg-white"
				>
					{pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
					Extract fields
				</Button>
				{pending && (
					<span className="text-xs text-zinc-500">Reading the permit…</span>
				)}
			</div>

			<input
				ref={fileInput}
				type="file"
				accept="application/pdf,.pdf"
				className="hidden"
				onChange={(e) => {
					takeFile(e.target.files?.[0]);
					e.target.value = "";
				}}
			/>
			<button
				type="button"
				disabled={pending}
				onClick={() => fileInput.current?.click()}
				onDragOver={(e) => {
					e.preventDefault();
					setDragOver(true);
				}}
				onDragLeave={() => setDragOver(false)}
				onDrop={onDrop}
				className={cn(
					"flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50",
					dragOver
						? "border-zinc-300 bg-zinc-800/70 text-zinc-100"
						: "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:bg-zinc-900",
				)}
			>
				<Upload className="size-4" aria-hidden />
				{dragOver
					? "Drop the PDF to read it"
					: "Drop a permit PDF or click to choose"}
				<span className="text-[11px] text-zinc-500">
					PDF with text, up to 5 MB
				</span>
			</button>

			{fileError && (
				<p role="alert" className="text-xs text-zinc-300">
					{fileError}
				</p>
			)}
			{serverError && (
				<p role="alert" className="text-xs text-zinc-300">
					{serverError.detail}{" "}
					<code className="font-mono text-zinc-500">{serverError.code}</code>
				</p>
			)}
		</section>
	);
}
