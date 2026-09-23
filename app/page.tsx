"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  VscAdd,
  VscFolderLibrary,
  VscFileZip,
  VscLoading,
  VscSearch,
} from "react-icons/vsc";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import ProjectCard, { ProjectData } from "@/components/dashboard/ProjectCard";
import CreateProjectModal from "@/components/dashboard/CreateProjectModal";
import { useSidebarStore } from "@/store/sidebar-store";
import { useEditorStore } from "@/store/editor-store";

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Fetch all projects on mount
  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (res.ok && data.projects) {
        setProjects(data.projects);
      }
    } catch (err) {
      console.error("Failed to load projects:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // Filter projects by search query
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.bucketName.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  }, [projects, searchQuery]);

  // Navigate to editor with the selected project
  const handleOpenProject = (project: ProjectData) => {
    // Set project context in stores
    useSidebarStore.getState().setFolderName(project.name);
    useSidebarStore.getState().setProjectSelected(true);
    useEditorStore.getState().setBucketName(project.bucketName);

    router.push(`/editor?projectId=${project.id}&bucketName=${project.bucketName}&name=${encodeURIComponent(project.name)}`);
  };

  // Delete project
  const handleDeleteProject = async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
      } else {
        const data = await res.json().catch(() => ({}));
        console.error("Delete failed:", data);
        alert(data.error || "Failed to delete project");
      }
    } catch (err: any) {
      console.error("Failed to delete project:", err);
      alert(err.message || "Network error while deleting project");
    }
  };

  // Handler when a new project is created
  const handleProjectCreated = (newProject: ProjectData) => {
    setProjects((prev) => [newProject, ...prev]);
    handleOpenProject(newProject);
  };

  // Aggregate stats across projects
  const totalFiles = useMemo(() => projects.reduce((acc, p) => acc + (p.fileCount || 0), 0), [projects]);
  const totalStorage = useMemo(() => {
    const bytes = projects.reduce((acc, p) => acc + (p.totalSize || 0), 0);
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }, [projects]);

  return (
    <div className="min-h-screen bg-[#070D14] text-[#F2F5F7] flex flex-col font-sans selection:bg-[#2D7FE8]/30">
      {/* Top Header */}
      <DashboardHeader
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        projectCount={projects.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 flex flex-col gap-6">
        {/* Quick Metrics Bar (Secondary Panel #0C141D with Card Surface #101A25 elements) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-[#0C141D] border border-[#1C3042]">
          {/* Health Metric */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[#101A25] border border-[#1C3042]/80">
            <div className="w-8 h-8 rounded-lg bg-[#55D98A]/15 border border-[#55D98A]/30 flex items-center justify-center text-[#55D98A] flex-shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-[#55D98A] shadow-[0_0_8px_rgba(85,217,138,0.5)]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] text-[#91A5BA] uppercase font-semibold tracking-wider">System Status</span>
              <span className="text-[13px] font-bold text-[#55D98A] truncate">All Systems Operational</span>
            </div>
          </div>

          {/* Storage Metric */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[#101A25] border border-[#1C3042]/80">
            <div className="w-8 h-8 rounded-lg bg-[#2D7FE8]/15 border border-[#4FA9FF]/30 flex items-center justify-center text-[#4FA9FF] flex-shrink-0">
              <VscFolderLibrary size={16} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] text-[#91A5BA] uppercase font-semibold tracking-wider">Storage &amp; Files</span>
              <span className="text-[13px] font-bold text-[#F2F5F7] truncate">{totalFiles} files · {totalStorage}</span>
            </div>
          </div>

          {/* VCS Engine Metric */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[#101A25] border border-[#1C3042]/80">
            <div className="w-8 h-8 rounded-lg bg-[#FFD52A]/15 border border-[#FFD52A]/30 flex items-center justify-center text-[#FFD52A] flex-shrink-0">
              <span className="text-[13px] font-mono font-bold text-[#FFD52A]">VCS</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] text-[#91A5BA] uppercase font-semibold tracking-wider">Version Control</span>
              <span className="text-[13px] font-bold text-[#FFD52A] truncate">Independent Per-File Graph</span>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#1C3042]">
          <div>
            <h2 className="text-[18px] font-bold text-[#F2F5F7]">
              Your Projects
            </h2>
            <p className="text-[12px] text-[#91A5BA]">
              Select an existing workspace or initialize a new isolated codebase
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              suppressHydrationWarning
              onClick={() => setIsCreateModalOpen(true)}
              className="
                flex items-center gap-2 px-4 py-2 rounded-lg
                bg-[#FFD52A] hover:bg-[#F4C51F] border border-[#FFD52A]
                text-[13px] font-bold text-[#070D14] cursor-pointer
                transition-all duration-150 shadow-sm
              "
            >
              <VscAdd size={15} />
              <span>New Project</span>
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-24 text-[#91A5BA]">
            <VscLoading className="animate-spin text-[#4FA9FF] mb-3" size={28} />
            <span className="text-[13px]">Loading your workspaces…</span>
          </div>
        ) : filteredProjects.length === 0 ? (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-[#1C3042] rounded-2xl bg-[#0C141D]/60 p-8 my-4">
            <div className="w-16 h-16 rounded-2xl bg-[#2D7FE8]/15 border border-[#4FA9FF]/30 text-[#4FA9FF] flex items-center justify-center mb-4">
              <VscFolderLibrary size={32} />
            </div>

            {searchQuery ? (
              <>
                <h3 className="text-[16px] font-semibold text-[#F2F5F7] mb-1">
                  No projects matching &ldquo;{searchQuery}&rdquo;
                </h3>
                <p className="text-[12px] text-[#91A5BA] mb-4">
                  Try adjusting your search terms or create a new project.
                </p>
                <button
                  suppressHydrationWarning
                  onClick={() => setSearchQuery("")}
                  className="px-3.5 py-1.5 rounded-lg bg-[#101A25] border border-[#1C3042] text-[#91A5BA] text-[12px] hover:bg-[#1C3042] hover:text-[#F2F5F7] transition-colors"
                >
                  Clear Search
                </button>
              </>
            ) : (
              <>
                <h3 className="text-[16px] font-semibold text-[#F2F5F7] mb-1">
                  No Projects Yet
                </h3>
                <p className="text-[13px] text-[#91A5BA] max-w-md leading-relaxed mb-6">
                  Get started by creating a blank project or importing an existing ZIP archive.
                  Each project operates in an isolated PostgreSQL &amp; MinIO environment.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    suppressHydrationWarning
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FFD52A] hover:bg-[#F4C51F] text-[#070D14] text-[13px] font-bold transition-colors"
                  >
                    <VscAdd size={15} />
                    <span>Create First Project</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          /* Project Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={handleOpenProject}
                onDelete={handleDeleteProject}
              />
            ))}
          </div>
        )}
      </main>

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleProjectCreated}
      />
    </div>
  );
}
