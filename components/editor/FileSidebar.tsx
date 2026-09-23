"use client"; 
import { useState, ChangeEvent } from "react";
import { VscChevronDown, VscChevronRight } from "react-icons/vsc";
import { processZipFile, uploadZipToProject } from "@/lib/client/zip-handler";
import { buildFolderTree } from "@/lib/client/folder-tree";
import { useSidebarStore } from "@/store/sidebar-store";
import { useEditorStore } from "@/store/editor-store";
import { FileTreeNode } from "@/components/editor/FileTreeNode";
import { useActiveFile } from "@/store/activitybar-store";
import { useEffect } from "react";
import { VscCode, VscClose } from "react-icons/vsc";
import { selectFileHandler } from "@/lib/client/file-selection";
import { getAllDraftsForFile, deleteDraftFull } from "@/lib/client/text-editor-db";
import { DraftRecord } from "@/types/interfaces";
import DeleteDraftConfirmPopup from "@/components/shared/DeleteDraftConfirmPopup";

function DraftList() {
    const selectedFile = useEditorStore((state) => state.selectedFile);
    const selectedDraft = useEditorStore((state) => state.selectedDraft);
    const bucketName = useEditorStore((state) => state.bucketName);
    const [drafts, setDrafts] = useState<DraftRecord[]>([]);
    const [deletingDraft, setDeletingDraft] = useState<{ name: string; path: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (!selectedFile) {
            setDrafts([]);
            return;
        }
        getAllDraftsForFile(selectedFile).then(setDrafts).catch(console.error);
    }, [selectedFile, selectedDraft]);

    if (!selectedFile || drafts.length === 0) return null;

    const handleSelect = (draftName: string) => {
        selectFileHandler(selectedFile, bucketName, draftName);
    };

    const handleDeleteClick = (e: React.MouseEvent, draftName: string) => {
        e.stopPropagation();
        setDeletingDraft({ name: draftName, path: selectedFile });
    };

    const handleConfirmDelete = async () => {
        if (!deletingDraft) return;
        setIsDeleting(true);
        try {
            await deleteDraftFull(deletingDraft.path, deletingDraft.name);
            // Best-effort SQL metadata cleanup
            fetch('/api/drafts/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: deletingDraft.path, name: deletingDraft.name })
            }).catch(() => {});

            const newDrafts = await getAllDraftsForFile(deletingDraft.path);
            setDrafts(newDrafts);
            if (selectedDraft === deletingDraft.name && newDrafts.length > 0) {
                selectFileHandler(deletingDraft.path, bucketName, newDrafts[0].name);
            } else if (newDrafts.length === 0) {
                selectFileHandler(deletingDraft.path, bucketName);
            }
            setDeletingDraft(null);
        } catch (err) {
            console.error('Failed to delete draft:', err);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <>
            <div className="flex flex-col font-normal">
                {drafts.map(draft => (
                    <div 
                        key={draft.name}
                        className={`group flex items-center justify-between py-1 px-4 cursor-pointer hover:bg-[#0e293f] text-[#89a4bb] hover:text-white text-[13px] transition-colors ${selectedDraft === draft.name ? 'border-l-[2px] border-[#82aaff] bg-[#0b2942] text-[#82aaff] font-medium' : 'border-l-[2px] border-transparent'}`}
                        onClick={() => handleSelect(draft.name)}
                    >
                        <div className="flex items-center gap-2 overflow-hidden w-full">
                            <VscCode size={14} className="text-[#7fdbca] flex-shrink-0" />
                            <span className="truncate">{draft.name}</span>
                        </div>
                        <button 
                            onClick={(e) => handleDeleteClick(e, draft.name)}
                            title="Delete draft"
                            className="opacity-0 group-hover:opacity-100 hover:bg-[#ef535033] hover:text-[#ef5350] p-[2px] rounded text-[#5f7e97] transition-colors"
                        >
                            <VscClose size={14} />
                        </button>
                    </div>
                ))}
            </div>

            <DeleteDraftConfirmPopup
                isOpen={!!deletingDraft}
                onClose={() => {
                    if (!isDeleting) setDeletingDraft(null);
                }}
                onConfirm={handleConfirmDelete}
                draftInfo={deletingDraft}
                isProcessing={isDeleting}
            />
        </>
    );
}

export default function ExplorerManager() {
    const activeFile = useActiveFile((state) => state.id);
    const isProjectSelected = useSidebarStore(state => state.isProjectSelected);
    const setProjectSelected = useSidebarStore(state => state.setProjectSelected);
    const fileTree = useSidebarStore(state => state.fileTree);
    const setFileTree = useSidebarStore(state => state.setFileTree);
    const setFolderName = useSidebarStore(state => state.setFolderName);

    if (activeFile !== "files") return null;  
    
    async function FileHandler(e: ChangeEvent<HTMLInputElement>) {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        if (!file.name.endsWith('.zip')) {
            alert('Please select a zip file');
            return;
        }

        try {
            const extractedFiles = await processZipFile(file);
            const folderTree = buildFolderTree(extractedFiles);
            setFileTree(folderTree);
            setProjectSelected(true);
            const projectName = file.name.replace(/\.zip$/, '');
            setFolderName(projectName);

            const bucketName = useEditorStore.getState().bucketName || projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
            useEditorStore.getState().setBucketName(bucketName);

            // Populate fileBuffers in RAM so files open instantly
            const newFileBuffers = new Map<string, { content: string; etag: string }>();
            extractedFiles.forEach((f) => {
                if (!f.isFolder) {
                    newFileBuffers.set(f.path, { content: f.content, etag: '' });
                }
            });
            useEditorStore.setState({ fileBuffers: newFileBuffers });

            // Upload to server in the background — don't block the UI
            uploadZipToProject(extractedFiles, bucketName).catch(err => {
                console.error("Background upload failed:", err);
            });
        } catch (error) {
            console.error("Failed to process and upload zip:", error);
        }
    }
     
    return (
        <aside className="w-[300px] h-screen bg-[#01111d] border-r border-[#122d42] flex flex-col text-[#d6deeb] font-sans selection:bg-[#1d3b53] overflow-hidden">
            {/* EXPLORER Header */}
            <div className="flex items-center justify-between px-5 pt-3 pb-2 text-[11px] text-[#5f7e97] tracking-wider mb-1">
                <span className="uppercase font-semibold">Explorer</span>
                <span className="cursor-pointer hover:text-white font-bold tracking-widest pb-1">···</span>
            </div>

            {!isProjectSelected ? (
                <ExplorerSidebarInitial onFileImport={FileHandler} />
            ) : (
                <ExplorerSidebarFiles fileTree={fileTree} onFileImport={FileHandler} />
            )}
        </aside>
    );
}

function ExplorerSidebarFiles({ fileTree, onFileImport }: { fileTree: any[]; onFileImport: (e: ChangeEvent<HTMLInputElement>) => void }) {
    const [isProjectOpen, setIsProjectOpen] = useState(true);
    const [isEditorsOpen, setIsEditorsOpen] = useState(true);
    const folderName = useSidebarStore((state) => state.folderName);  
    return (
        <div className="flex-1 overflow-y-auto w-full pb-4 scrollbar-hide">
            {/* OPEN EDITORS Section Header */}
            <div className="flex flex-col w-full text-[11px] font-bold text-[#5f7e97] font-sans select-none mb-1">
                <div
                    className="flex items-center py-[4px] cursor-pointer hover:bg-[#0e293f] px-1 group transition-colors"
                    onClick={() => setIsEditorsOpen(!isEditorsOpen)}
                >
                    <span className="w-[22px] flex justify-center items-center text-[#5f7e97]">
                        {isEditorsOpen ? <VscChevronDown size={16} /> : <VscChevronRight size={16} />}
                    </span>
                    <span className="tracking-wider">OPEN EDITORS</span>
                </div>
                {isEditorsOpen && <DraftList />}
            </div>

            {/* PROJECT Section Header */}
            <div className="flex flex-col w-full text-[11px] font-bold text-[#5f7e97] font-sans select-none mt-1">
                <div
                    className="flex items-center py-[4px] cursor-pointer hover:bg-[#0e293f] px-1 group transition-colors"
                    onClick={() => setIsProjectOpen(!isProjectOpen)}
                >
                    <span className="w-[22px] flex justify-center items-center text-[#5f7e97]">
                        {isProjectOpen ? <VscChevronDown size={16} /> : <VscChevronRight size={16} />}
                    </span>
                    <span className="tracking-wider uppercase text-[#82aaff]">{folderName}</span>
                </div>
                {isProjectOpen && (
                    <div className="mt-1 font-normal">
                        {fileTree.length === 0 ? (
                            <div className="flex flex-col px-6 py-4 text-[#5f7e97] text-xs gap-3">
                                <p>No files in this project yet.</p>
                                <label
                                    htmlFor="sidebarImportZip"
                                    className="bg-[#82aaff] hover:bg-[#709bf0] cursor-pointer text-[#011627] py-1.5 px-3 text-center rounded text-xs font-bold transition-all shadow-sm"
                                >
                                    Import ZIP Files
                                </label>
                                <input
                                    id="sidebarImportZip"
                                    type="file"
                                    accept=".zip"
                                    hidden
                                    onChange={onFileImport}
                                />
                            </div>
                        ) : (
                            fileTree.map(rootNode => (
                                <FileTreeNode key={rootNode.path || rootNode.name} node={rootNode} depth={0} /> 
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function ExplorerSidebarInitial({ onFileImport }: { onFileImport: (e: ChangeEvent<HTMLInputElement>) => void }) {
    return (
        <div className="flex flex-col px-6 space-y-4 mt-6 text-[#d6deeb] text-[13px]">
            <p className="leading-relaxed text-[#5f7e97]">To start with the project click on the "Open Folder" below</p>
            <label htmlFor="zipInput" className="bg-[#82aaff] hover:bg-[#709bf0] cursor-pointer text-[#011627] font-bold py-[7px] text-center rounded outline-none border border-[#82aaff] shadow-sm transition-all">Open Folder</label>
            <input id="zipInput" type="file" 
             accept=".zip"
             hidden 
             onChange={onFileImport}/>

            <div className="h-[1px] w-full bg-[#122d42] my-2"></div>
        </div>
    );
}
