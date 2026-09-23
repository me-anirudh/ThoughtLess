"use client";

import React, { useState, useRef, ChangeEvent } from "react";
import {
  VscClose,
  VscFolder,
  VscFileZip,
  VscLoading,
  VscCloudUpload,
  VscCheck,
} from "react-icons/vsc";
import { processZipFile, uploadZipToProject } from "@/lib/client/zip-handler";
import { buildFolderTree } from "@/lib/client/folder-tree";
import { useSidebarStore } from "@/store/sidebar-store";
import { useEditorStore } from "@/store/editor-store";
import { ProjectData } from "./ProjectCard";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (project: ProjectData) => void;
}

export default function CreateProjectModal({
  isOpen,
  onClose,
  onCreated,
}: CreateProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"blank" | "zip">("blank");
  const [zipFiles, setZipFiles] = useState<any[]>([]);
  const [zipFileName, setZipFileName] = useState<string>("");
  const [isProcessingZip, setIsProcessingZip] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleZipSelection = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setZipFileName(file.name);
    setIsProcessingZip(true);
    setErrorMessage(null);

    try {
      const extracted = await processZipFile(file);
      setZipFiles(extracted);
      if (!name) {
        // Auto-fill project name from zip filename
        const suggestedName = file.name.replace(/\.[^/.]+$/, "");
        setName(suggestedName);
      }
    } catch (err: any) {
      console.error("Failed to parse zip file:", err);
      setErrorMessage("Could not parse ZIP file. Please ensure it is a valid archive.");
      setZipFiles([]);
    } finally {
      setIsProcessingZip(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setErrorMessage("Project name is required.");
      return;
    }

    if (mode === "zip" && zipFiles.length === 0) {
      setErrorMessage("Please select a valid ZIP file to import.");
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);
    setUploadStatus(null);

    try {
      // 1. Create project metadata and bucket in DB / MinIO
      const res = await fetch("/api/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create project");
      }

      const createdProject: ProjectData = data.project;

      // 2. If ZIP mode, upload extracted files in batches to MinIO and FileSystem
      if (mode === "zip" && zipFiles.length > 0) {
        setUploadStatus(`Uploading ${zipFiles.length} files…`);
        
        await uploadZipToProject(zipFiles, createdProject.bucketName, (completed, total) => {
          setUploadStatus(`Uploading files: ${completed}/${total}…`);
        });

        // Pre-populate editor RAM cache with the extracted files
        const state = useEditorStore.getState();
        const newBuffers = new Map(state.fileBuffers);
        zipFiles.forEach((f) => {
          if (!f.isFolder) {
            const fileName = f.path.split("/").filter(Boolean).pop() || "Untitled";
            newBuffers.set(f.path, { content: f.content, etag: "" });
            newBuffers.set(`${f.path}::${fileName}`, { content: f.content, etag: "" });
          }
        });
        useEditorStore.setState({ fileBuffers: newBuffers });

        // Pre-populate sidebar store with folder tree so file explorer displays immediately
        const folderTree = buildFolderTree(zipFiles);
        useSidebarStore.getState().setFileTree(folderTree);
        useSidebarStore.getState().setFolderName(createdProject.name);
        useSidebarStore.getState().setProjectSelected(true);
        useSidebarStore.getState().cacheTree(createdProject.bucketName, folderTree);

        createdProject.fileCount = zipFiles.filter((f) => !f.isFolder).length;
      }

      onCreated(createdProject);
      onClose();
    } catch (err: any) {
      console.error("Failed to create project:", err);
      setErrorMessage(err.message || "An error occurred while creating project");
    } finally {
      setIsCreating(false);
      setUploadStatus(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-lg bg-[#0C141D] border border-[#1C3042] rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.8)] overflow-hidden animate-[popupIn_150ms_ease-out]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1C3042]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#2D7FE8]/15 border border-[#4FA9FF]/30 flex items-center justify-center text-[#4FA9FF]">
              <VscFolder size={18} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[#F2F5F7] leading-tight">
                Create New Project
              </h2>
              <p className="text-[11px] text-[#91A5BA] leading-tight mt-0.5">
                Set up an isolated codebase workspace
              </p>
            </div>
          </div>

          <button
            suppressHydrationWarning
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-[#91A5BA] hover:text-[#F2F5F7] hover:bg-[#101A25] transition-colors"
          >
            <VscClose size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex flex-col gap-4">
          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#070D14] rounded-lg border border-[#1C3042]">
            <button
              suppressHydrationWarning
              type="button"
              onClick={() => setMode("blank")}
              className={`
                flex items-center justify-center gap-2 py-2 rounded-md text-[12px] font-medium transition-all
                ${
                  mode === "blank"
                    ? "bg-[#101A25] text-[#FFD52A] font-semibold shadow-sm border border-[#1C3042]"
                    : "text-[#91A5BA] hover:text-[#F2F5F7]"
                }
              `}
            >
              <VscFolder size={14} />
              <span>Blank Project</span>
            </button>
            <button
              suppressHydrationWarning
              type="button"
              onClick={() => setMode("zip")}
              className={`
                flex items-center justify-center gap-2 py-2 rounded-md text-[12px] font-medium transition-all
                ${
                  mode === "zip"
                    ? "bg-[#101A25] text-[#FFD52A] font-semibold shadow-sm border border-[#1C3042]"
                    : "text-[#91A5BA] hover:text-[#F2F5F7]"
                }
              `}
            >
              <VscFileZip size={14} />
              <span>Import ZIP Archive</span>
            </button>
          </div>

          {/* Project Name Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#91A5BA]">
              Project Name <span className="text-[#ff2c70]">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. backend-api, my-saas-frontend"
              suppressHydrationWarning
              className="
                w-full px-3 py-2 rounded-lg
                bg-[#101A25] border border-[#1C3042]
                text-[13px] text-[#F2F5F7] placeholder:text-[#91A5BA]/50
                outline-none transition-all
                focus:border-[#4FA9FF] focus:ring-1 focus:ring-[#4FA9FF33]
              "
            />
          </div>

          {/* Project Description Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#91A5BA]">
              Description <span className="text-[#91A5BA]/60 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of what this project does..."
              className="
                w-full px-3 py-2 rounded-lg
                bg-[#101A25] border border-[#1C3042]
                text-[13px] text-[#F2F5F7] placeholder:text-[#91A5BA]/50
                outline-none transition-all resize-none
                focus:border-[#4FA9FF] focus:ring-1 focus:ring-[#4FA9FF33]
              "
            />
          </div>

          {/* ZIP File Upload Drop Area */}
          {mode === "zip" && (
            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-medium text-[#91A5BA]">
                Source ZIP File
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleZipSelection}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="
                  border-2 border-dashed border-[#1C3042] hover:border-[#4FA9FF]/60
                  bg-[#070D14]/70 hover:bg-[#070D14] rounded-xl p-5
                  flex flex-col items-center justify-center text-center
                  cursor-pointer transition-all duration-150
                "
              >
                {isProcessingZip ? (
                  <div className="flex items-center gap-2 text-[#4FA9FF] text-[13px]">
                    <VscLoading className="animate-spin" size={18} />
                    <span>Extracting archive files…</span>
                  </div>
                ) : zipFiles.length > 0 ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-8 h-8 rounded-full bg-[#55D98A]/20 text-[#55D98A] flex items-center justify-center">
                      <VscCheck size={18} />
                    </div>
                    <span className="text-[13px] font-medium text-[#F2F5F7]">
                      {zipFileName}
                    </span>
                    <span className="text-[11px] text-[#91A5BA]">
                      {zipFiles.length} files extracted ready for import
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <VscCloudUpload size={24} className="text-[#4FA9FF] mb-1" />
                    <span className="text-[13px] font-medium text-[#F2F5F7]">
                      Click to choose or drag a .zip file
                    </span>
                    <span className="text-[11px] text-[#91A5BA]">
                      Supports Node.js, React, Python, or any codebase archives
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-[#ff2c70]/10 border border-[#ff2c70]/30 text-[12px] text-[#ff2c70]">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 bg-[#070D14] border-t border-[#1C3042]">
          <button
            suppressHydrationWarning
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-transparent border border-[#1C3042] text-[13px] text-[#91A5BA] hover:bg-[#101A25] hover:text-[#F2F5F7] transition-colors"
          >
            Cancel
          </button>
          <button
            suppressHydrationWarning
            type="button"
            onClick={handleCreate}
            disabled={isCreating || isProcessingZip || !name.trim() || (mode === "zip" && zipFiles.length === 0)}
            className="
              px-5 py-2 rounded-lg bg-[#FFD52A] border border-[#FFD52A]
              text-[13px] font-bold text-[#070D14] cursor-pointer
              transition-all duration-150 hover:bg-[#F4C51F]
              disabled:opacity-40 disabled:cursor-not-allowed
              flex items-center gap-2
            "
          >
            {isCreating && <VscLoading className="animate-spin text-[#070D14]" size={14} />}
            <span>{uploadStatus || (isCreating ? "Creating Project…" : "Create Project")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
