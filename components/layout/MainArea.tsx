"use client";
import dynamic from "next/dynamic";
import { useCallback, memo } from "react";
import { useEditorStore } from "@/store/editor-store";
import { useGraphDataStore } from "@/store/graph-data-store";
import { VscCode, VscCheck, VscWarning, VscSourceControl, VscClose } from "react-icons/vsc";
import { getLanguageFromPath } from "@/lib/utils/language-map";
import GraphSearch from "@/components/graph/GraphSearch";
import GraphRenderer from "@/components/graph/GraphRenderer";
import DiffInspector from "@/components/graph/DiffInspector";

const CodeEditor = dynamic(() => import("@/components/editor/CodeEditor"), {
	ssr: false,
	loading: () => (
		<div className="flex items-center justify-center h-full text-[#858585] text-sm">
			Loading editor…
		</div>
	),
});

// Memoized sub-components to avoid unnecessary re-renders

const TabBar = memo(function TabBar() {
	const fileSelected = useEditorStore((state) => state.selectedFile);
	const selectedDraft = useEditorStore((state) => state.selectedDraft);
	const isDirty = useEditorStore((state) => state.isDirty);
	const isGraphViewOpen = useGraphDataStore((state) => state.isGraphViewOpen);
	const setGraphViewOpen = useGraphDataStore((state) => state.setGraphViewOpen);

	if (!fileSelected && !isGraphViewOpen) return <div className="h-full" />;

	return (
		<div className="flex items-center h-[34px] bg-[#01111d] text-[13px] text-[#d6deeb] cursor-default select-none overflow-x-auto scrollbar-hide">
			{/* File Tab */}
			{fileSelected && (
				<div 
					onClick={() => setGraphViewOpen(false)}
					className={`flex items-center h-full px-3 gap-2 border-r border-r-[#122d42] cursor-pointer transition-colors ${
						!isGraphViewOpen 
							? "bg-[#0b2942] border-t-[2px] border-t-[#82aaff] text-white font-medium" 
							: "bg-[#01111d] text-[#5f7e97] hover:bg-[#0e293f] hover:text-white"
					}`}
				>
					<span className="text-[#7fdbca] flex-shrink-0 flex items-center"><VscCode size={14} /></span>
					<span className="whitespace-nowrap overflow-hidden text-ellipsis max-w-[250px]">
						{(fileSelected.split("/").pop() || fileSelected)}
						{selectedDraft && selectedDraft !== 'root' && (
							<span className="text-[#82aaff] ml-2 font-normal">({selectedDraft})</span>
						)}
					</span>
					{isDirty && (
						<span className="w-2 h-2 rounded-full bg-[#82aaff] ml-1"></span>
					)}
				</div>
			)}

			{/* Thought Threads Tab */}
			{isGraphViewOpen && (
				<div 
					onClick={() => setGraphViewOpen(true)}
					className={`flex items-center h-full px-3 gap-2 border-r border-r-[#122d42] cursor-pointer transition-colors group ${
						isGraphViewOpen
							? "bg-[#0b2942] border-t-[2px] border-t-[#82aaff] text-[#82aaff] font-medium"
							: "bg-[#01111d] text-[#5f7e97] hover:bg-[#0e293f] hover:text-white"
					}`}
				>
					<span className="text-[#82aaff] flex-shrink-0 flex items-center"><VscSourceControl size={14} /></span>
					<span className="whitespace-nowrap font-medium text-[13px]">Thought Threads</span>
					<button
						onClick={(e) => {
							e.stopPropagation();
							setGraphViewOpen(false);
						}}
						title="Close Threads"
						className="ml-1 p-0.5 rounded text-[#5f7e97] hover:text-[#ef5350] hover:bg-[#ef535022] transition-colors"
					>
						<VscClose size={14} />
					</button>
				</div>
			)}
		</div>
	);
});
  
const Breadcrumb = memo(function Breadcrumb() {
	const fileSelected = useEditorStore((state) => state.selectedFile);
	if (!fileSelected) return null;

	return (
		<div className="h-[24px] min-h-[24px] bg-[#01111d] flex items-center px-4 text-[11px] text-[#5f7e97] border-b border-[#122d42] select-none font-mono">
			<span className="opacity-90">{fileSelected.replace(/\//g, " › ")}</span>
		</div>
	);
});

const StatusBar = memo(function StatusBar() {
	const fileSelected = useEditorStore((state) => state.selectedFile);
	const saveStatus = useEditorStore((state) => state.saveStatus);
	const isDirty = useEditorStore((state) => state.isDirty);
	const isGraphViewOpen = useGraphDataStore((state) => state.isGraphViewOpen);
	const commitsCount = useGraphDataStore((state) => state.commits.length);
	
	return (
		<div className="h-[22px] min-h-[22px] bg-[#010d18] border-t border-[#122d42] flex items-center justify-between px-3 text-[11px] text-[#5f7e97] select-none">
			<div className="flex items-center gap-3">
				<span className="text-[#82aaff] font-bold tracking-wide">ThoughtLess</span>
				{isGraphViewOpen ? (
					<span className="flex items-center gap-1.5 text-[#d6deeb]">
						<VscSourceControl size={13} className="text-[#82aaff]" />
						<span>Thought Threads ({commitsCount} {commitsCount === 1 ? 'commit' : 'commits'})</span>
					</span>
				) : fileSelected ? (
					<span className="flex items-center gap-1 text-[#d6deeb]">
						{saveStatus === 'saving' && <span className="text-[#ecc48d]">Saving...</span>}
						{saveStatus === 'saved' && !isDirty && <span className="flex items-center gap-1 text-[#addb67]"><VscCheck size={14} /> Saved</span>}
						{saveStatus === 'error' && <span className="flex items-center gap-1 text-[#ef5350]"><VscWarning size={14} /> Save failed</span>}
						{isDirty && saveStatus !== 'saving' && <span className="text-[#ecc48d]">● Unsaved</span>}
					</span>
				) : null}
			</div>
			<div className="flex items-center gap-3 font-mono text-[10px]">
				{isGraphViewOpen ? (
					<span className="text-[#7fdbca]">Graph View</span>
				) : fileSelected ? (
					<>
						<span>UTF-8</span>
						<span>LF</span>
					</>
				) : null}
			</div>
		</div>
	);
});

const EditorArea = memo(function EditorArea() {
	const fileSelected = useEditorStore((state) => state.selectedFile);
	const setEditorContent = useEditorStore((state) => state.updateBuffer);
	const fileVersion = useEditorStore((state) => state.fileVersion);

	const onEditorChange = useCallback((value: string) => {
		setEditorContent(value);
	}, [setEditorContent]);

	if (!fileSelected) {
		return (
			<div className="flex-1 h-full flex items-center justify-center bg-[#011627]">
				<div className="text-center">
					<svg className="w-28 h-28 mx-auto text-[#1f384c] mb-4" fill="currentColor" viewBox="0 0 24 24">
						<path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"/>
					</svg>
					<p className="text-[#5f7e97] text-sm tracking-wide font-medium">Select a file to start coding</p>
				</div>
			</div>
		);
	}

	// Read buffer directly when file or fileVersion changes — eliminates re-rendering on keystrokes
	const editorContent = useEditorStore.getState().buffer;

	return (
		<CodeEditor
			value={editorContent}
			onChange={onEditorChange}
			language={getLanguageFromPath(fileSelected)}
			path={fileSelected}
			fileVersion={fileVersion}
		/>
	);
});

export default function MainBar() {
	const isGraphViewOpen = useGraphDataStore((state) => state.isGraphViewOpen);

	return (
		<main className="flex-1 flex flex-col min-w-0 bg-[#011627] border-l border-[#122d42]">
			{/* Editor Tab Bar */}
			<div className="h-[35px] min-h-[35px] bg-[#01111d] flex items-end border-b border-[#122d42]">
				<TabBar />
			</div>

			{isGraphViewOpen ? (
				/* Graph View Interface */
				<div className="flex-1 flex flex-col min-h-0 relative overflow-hidden bg-[#011627]">
					<GraphSearch />
					<div className="flex-1 relative overflow-hidden flex flex-row">
						<div className="flex-1 relative overflow-hidden h-full">
							<GraphRenderer />
						</div>
						<DiffInspector />
					</div>
				</div>
			) : (
				/* Code Editor View */
				<>
					<Breadcrumb />
					<div className="flex-1 overflow-hidden bg-[#011627]">
						<EditorArea />
					</div>
				</>
			)}

			{/* Status Bar */}
			<StatusBar />
		</main>
	);
}
