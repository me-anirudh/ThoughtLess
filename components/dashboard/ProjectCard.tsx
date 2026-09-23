"use client";

import React, { useState } from "react";
import {
  VscFolder,
  VscTrash,
  VscArrowRight,
  VscSourceControl,
  VscDatabase,
  VscFiles,
  VscLoading,
} from "react-icons/vsc";

export interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  bucketName: string;
  createdAt: string;
  updatedAt: string;
  versionsCount: number;
  fileCount: number;
  totalSize: number;
}

interface ProjectCardProps {
  project: ProjectData;
  onOpen: (project: ProjectData) => void;
  onDelete: (projectId: string) => Promise<void>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function ProjectCard({
  project,
  onOpen,
  onDelete,
}: ProjectCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(project.id);
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div
      onClick={() => onOpen(project)}
      className="
        group relative flex flex-col justify-between
        bg-[#101A25] border border-[#1C3042] rounded-xl p-5
        cursor-pointer select-none transition-all duration-200
        hover:border-[#4FA9FF]/60 hover:shadow-[0_8px_24px_rgba(7,13,20,0.8)]
        hover:-translate-y-0.5
      "
    >
      {/* Top Header */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-[#0C141D] border border-[#1C3042] flex items-center justify-center text-[#4FA9FF] group-hover:bg-[#2D7FE8]/15 group-hover:border-[#4FA9FF]/40 transition-colors flex-shrink-0">
              <VscFolder size={20} />
            </div>
            <div className="flex flex-col min-w-0">
              <h3 className="text-[15px] font-semibold text-[#F2F5F7] group-hover:text-[#4FA9FF] transition-colors truncate">
                {project.name}
              </h3>
              <span className="text-[11px] font-mono text-[#91A5BA] truncate flex items-center gap-1">
                <VscDatabase size={11} className="text-[#91A5BA]" />
                {project.bucketName}
              </span>
            </div>
          </div>

          {/* Delete Action */}
          <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
            {confirmDelete ? (
              <div className="flex items-center gap-1.5 bg-[#070D14] p-1 rounded-md border border-[#ff2c70]/40">
                <button
                  suppressHydrationWarning
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-2 py-0.5 bg-[#ff2c70] text-white rounded text-[11px] font-bold hover:bg-[#e0205e] transition-colors flex items-center gap-1"
                >
                  {isDeleting ? <VscLoading className="animate-spin" size={12} /> : "Delete"}
                </button>
                <button
                  suppressHydrationWarning
                  onClick={() => setConfirmDelete(false)}
                  className="px-1.5 py-0.5 text-[#91A5BA] hover:text-[#F2F5F7] text-[11px]"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                suppressHydrationWarning
                onClick={handleDelete}
                title="Delete project"
                className="
                  w-8 h-8 rounded-md flex items-center justify-center
                  text-[#91A5BA] hover:text-[#ff2c70] hover:bg-[#ff2c70]/10
                  transition-colors opacity-0 group-hover:opacity-100
                "
              >
                <VscTrash size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-[12px] text-[#91A5BA] line-clamp-2 leading-relaxed mb-4 min-h-[36px]">
          {project.description || "No description provided for this project."}
        </p>
      </div>

      {/* Card Footer / Stats */}
      <div className="pt-3 border-t border-[#1C3042] flex items-center justify-between text-[11px] text-[#91A5BA]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 font-medium text-[#F2F5F7]">
            <VscFiles size={13} className="text-[#91A5BA]" />
            {project.fileCount} {project.fileCount === 1 ? "file" : "files"}
          </span>
          {project.totalSize > 0 && (
            <span>• {formatBytes(project.totalSize)}</span>
          )}
          <span suppressHydrationWarning>• Updated {formatDate(project.updatedAt)}</span>
        </div>

        <div className="flex items-center gap-1 text-[#4FA9FF] group-hover:text-[#FFD52A] font-semibold text-[12px] group-hover:translate-x-0.5 transition-all">
          <span>Open</span>
          <VscArrowRight size={13} />
        </div>
      </div>
    </div>
  );
}
