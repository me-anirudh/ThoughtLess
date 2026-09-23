"use client";
import { useEditorStore } from "@/store/editor-store";
import { useSidebarStore } from "@/store/sidebar-store";
import { useState, useRef, useEffect, useCallback } from "react";
import { VscClose, VscGitMerge, VscWarning } from "react-icons/vsc";
import { getDraft } from "@/lib/client/text-editor-db";

interface CreateBranchPopupProps {
	isOpen: boolean;
	onClose: () => void;
	onCreate: (branchName: string, parent: string) => void;
}

function formatDefaultBranchName(): string {
	const now = new Date();
	const months = [
		"Jan", "Feb", "Mar", "Apr", "May", "Jun",
		"Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
	];
	const month = months[now.getMonth()];
	const day = now.getDate();
	const year = now.getFullYear();
	const hours = now.getHours();
	const minutes = now.getMinutes().toString().padStart(2, "0");
	const ampm = hours >= 12 ? "PM" : "AM";
	const hour12 = hours % 12 || 12;

	return `Draft – ${month} ${day}, ${year} · ${hour12}:${minutes} ${ampm}`;
}

export default function CreateBranchPopup({
	isOpen,
	onClose,
	onCreate,
}: CreateBranchPopupProps) {
	const [branchName, setBranchName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const popupRef = useRef<HTMLDivElement>(null);
	// Generate fresh name & focus input when popup opens
	useEffect(() => {
		if (isOpen) {
			setBranchName(formatDefaultBranchName());
			setError(null);
			// Small delay to let the DOM render before focusing
			requestAnimationFrame(() => {
				inputRef.current?.focus();
				inputRef.current?.select();
			});
		}
	}, [isOpen]);

	// Close on Escape key
	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose]);

	// Close when clicking outside the popup
	useEffect(() => {
		if (!isOpen) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		// Use setTimeout so the click that opened the popup doesn't immediately close it
		const timer = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
		}, 0);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen, onClose]);

	const handleSubmit = useCallback(async () => {
		const trimmed = branchName.trim();
		if (!trimmed) return;
		const selectedFile = useEditorStore.getState().selectedFile;
		const folderName = useSidebarStore.getState().folderName;
		const parent = selectedFile || folderName || 'root';
		
		const existing = await getDraft(parent, trimmed);
		if (existing) {
			setError(`A draft named "${trimmed}" already exists for this file.`);
			return;
		}

		onCreate(trimmed, parent);
		onClose();
	}, [branchName, onCreate, onClose]);

	if (!isOpen) return null;

	return (
		/* Backdrop overlay */
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px]">
			{/* Popup card */}
			<div
				ref={popupRef}
				className="
					w-[400px]
					bg-[#011627]
					border border-[#1f384c]
					rounded-xl
					shadow-[0_16px_48px_rgba(0,0,0,0.8)]
					overflow-hidden
					animate-[popupIn_200ms_ease-out]
				"
			>
				{/* Header */}
				<div className="flex items-center justify-between px-5 py-4 border-b border-[#122d42]">
					<div className="flex items-center gap-2.5">
						<div className="w-8 h-8 rounded-lg bg-[#82aaff]/15 flex items-center justify-center">
							<VscGitMerge size={16} className="text-[#82aaff]" />
						</div>
						<div className="flex flex-col">
							<span className="text-[14px] font-semibold text-[#d6deeb] leading-tight">
								Create a Branch
							</span>
							<span className="text-[11px] text-[#5f7e97] leading-tight mt-0.5">
								A new draft variant of the current file
							</span>
						</div>
					</div>
					<button
						onClick={onClose}
						className="
							w-7 h-7 flex items-center justify-center
							rounded-md
							text-[#5f7e97]
							bg-transparent border-none cursor-pointer
							transition-colors duration-100
							hover:text-white hover:bg-[#0b253a]
						"
					>
						<VscClose size={16} />
					</button>
				</div>

				{/* Body */}
				<div className="px-5 py-4 flex flex-col gap-3">
					<label className="text-[12px] text-[#5f7e97] font-medium">
						Branch name
					</label>
					<input
						ref={inputRef}
						type="text"
						value={branchName}
						onChange={(e) => {
							setBranchName(e.target.value);
							if (error) setError(null);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleSubmit();
						}}
						placeholder="Enter a name for this branch..."
						className={`
							w-full px-3 py-2.5
							rounded-lg
							bg-[#0b253a]
							border ${error ? 'border-[#ef5350]' : 'border-[#1f384c]'}
							text-[13px] text-[#d6deeb]
							placeholder:text-[#5f7e97]
							outline-none
							transition-all duration-150
							${error ? 'focus:ring-1 focus:ring-[#ef535033] focus:shadow-[0_0_0_3px_rgba(239,83,80,0.15)]' : 'focus:border-[#82aaff] focus:ring-1 focus:ring-[#82aaff33] focus:shadow-[0_0_0_3px_rgba(130,170,255,0.15)]'}
						`}
					/>
					{error ? (
						<p className="text-[11px] text-[#ef5350] leading-snug -mt-1 flex items-center gap-1">
							<VscWarning size={12} /> {error}
						</p>
					) : (
						<p className="text-[11px] text-[#5f7e97] leading-snug -mt-1">
							You can rename this anytime. Press <kbd className="px-1.5 py-0.5 rounded bg-[#01111d] border border-[#1f384c] text-[10px] text-[#7fdbca] font-mono">Enter</kbd> to confirm.
						</p>
					)}
				</div>

				{/* Footer */}
				<div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#122d42] bg-[#01111d]">
					<button
						onClick={onClose}
						className="
							px-4 py-[7px]
							rounded-md
							bg-[#0b253a]
							border border-[#1f384c]
							text-[13px] text-[#d6deeb]
							cursor-pointer
							transition-colors duration-150
							hover:bg-[#1d3b53] hover:text-white
						"
					>
						Cancel
					</button>
					<button
						onClick={handleSubmit}
						disabled={!branchName.trim()}
						className="
							px-4 py-[7px]
							rounded-md
							bg-[#82aaff]
							border border-[#82aaff]
							text-[13px] font-bold text-[#011627]
							cursor-pointer
							transition-all duration-150
							hover:bg-[#9abaff]
							active:scale-[0.97]
							disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#82aaff]
						"
					>
						Create Branch
					</button>
				</div>
			</div>
		</div>
	);
}
