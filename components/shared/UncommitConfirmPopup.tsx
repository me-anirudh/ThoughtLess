"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { VscClose, VscWarning } from "react-icons/vsc";

interface UncommitConfirmPopupProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
	commitInfo: {
		id: string;
		hash: string;
		filePath: string;
		message: string;
	} | null;
	isProcessing?: boolean;
}

export default function UncommitConfirmPopup({
	isOpen,
	onClose,
	onConfirm,
	commitInfo,
	isProcessing = false,
}: UncommitConfirmPopupProps) {
	const popupRef = useRef<HTMLDivElement>(null);

	// Close on Escape key
	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !isProcessing) onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose, isProcessing]);

	// Close when clicking outside the popup
	useEffect(() => {
		if (!isOpen) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (
				!isProcessing &&
				popupRef.current &&
				!popupRef.current.contains(e.target as Node)
			) {
				onClose();
			}
		};
		const timer = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
		}, 0);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen, onClose, isProcessing]);

	if (!isOpen || !commitInfo) return null;

	return (
		/* Backdrop overlay */
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px]">
			{/* Popup card */}
			<div
				ref={popupRef}
				className="
					w-[420px]
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
						<div className="w-8 h-8 rounded-lg bg-[#ef5350]/15 flex items-center justify-center">
							<VscWarning size={16} className="text-[#ef5350]" />
						</div>
						<div className="flex flex-col">
							<span className="text-[14px] font-semibold text-[#d6deeb] leading-tight">
								Uncommit Snapshot
							</span>
							<span className="text-[11px] text-[#5f7e97] leading-tight mt-0.5">
								This will revert the commit to a draft
							</span>
						</div>
					</div>
					<button
						onClick={onClose}
						disabled={isProcessing}
						className="
							w-7 h-7 flex items-center justify-center
							rounded-md
							text-[#5f7e97]
							bg-transparent border-none cursor-pointer
							transition-colors duration-100
							hover:text-white hover:bg-[#0b253a]
							disabled:opacity-40 disabled:cursor-not-allowed
						"
					>
						<VscClose size={16} />
					</button>
				</div>

				{/* Body */}
				<div className="px-5 py-4 flex flex-col gap-3">
					{/* Commit details */}
					<div className="flex flex-col gap-2 p-3 rounded-lg bg-[#01111d] border border-[#1f384c]">
						<div className="flex items-center justify-between">
							<span className="text-[12px] text-[#5f7e97]">Commit</span>
							<span className="px-2 py-[2px] rounded bg-[#011627] border border-[#1f384c] text-[10px] font-mono text-[#7fdbca] select-all">
								{commitInfo.hash}
							</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-[12px] text-[#5f7e97]">Message</span>
							<span className="text-[12px] text-[#d6deeb] truncate max-w-[200px]">
								{commitInfo.message}
							</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-[12px] text-[#5f7e97]">File</span>
							<span className="text-[12px] text-[#82aaff] truncate max-w-[200px] font-mono">
								{commitInfo.filePath}
							</span>
						</div>
					</div>

					{/* Warning */}
					<div className="flex items-start gap-2 p-3 rounded-lg bg-[#ef5350]/10 border border-[#ef5350]/30">
						<VscWarning size={14} className="text-[#ef5350] mt-0.5 flex-shrink-0" />
						<p className="text-[11px] text-[#ef5350] leading-relaxed">
							The committed file will be removed from the version graph and saved as a new draft 
							named <span className="font-mono text-[#ecc48d]">uncommited-{"{"}{new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{"}"}</span>. 
							This action can be undone.
						</p>
					</div>
				</div>

				{/* Footer */}
				<div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#122d42] bg-[#01111d]">
					<button
						onClick={onClose}
						disabled={isProcessing}
						className="
							px-4 py-[7px]
							rounded-md
							bg-[#0b253a]
							border border-[#1f384c]
							text-[13px] text-[#d6deeb]
							cursor-pointer
							transition-colors duration-150
							hover:bg-[#1d3b53] hover:text-white
							disabled:opacity-40 disabled:cursor-not-allowed
						"
					>
						Cancel
					</button>
					<button
						onClick={onConfirm}
						disabled={isProcessing}
						className="
							px-4 py-[7px]
							rounded-md
							bg-[#ef5350]
							border border-[#ef5350]
							text-[13px] font-bold text-white
							cursor-pointer
							transition-all duration-150
							hover:bg-[#d83a37]
							active:scale-[0.97]
							disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[#ef5350]
						"
					>
						{isProcessing ? (
							<span className="flex items-center gap-2">
								<span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
								Uncommitting…
							</span>
						) : (
							"Uncommit"
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
