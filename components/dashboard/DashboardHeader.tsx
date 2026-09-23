"use client";

import React from "react";
import { VscSearch, VscFolderLibrary, VscShield, VscOrganization } from "react-icons/vsc";

interface DashboardHeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  projectCount: number;
}

export default function DashboardHeader({
  searchQuery,
  setSearchQuery,
  projectCount,
}: DashboardHeaderProps) {
  return (
    <header className="w-full bg-[#0C141D] border-b border-[#1C3042] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 select-none">
      {/* Brand & Stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#2D7FE8]/15 border border-[#4FA9FF]/30 flex items-center justify-center text-[#4FA9FF] shadow-[0_0_12px_rgba(79,169,255,0.15)]">
            <VscFolderLibrary size={20} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-[17px] font-bold text-[#F2F5F7] tracking-tight">
                ThoughtLess
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#2D7FE8]/15 text-[#4FA9FF] border border-[#4FA9FF]/30">
                Workspace
              </span>
            </div>
            <p className="text-[11px] text-[#91A5BA]">
              Project Workspace Hub · {projectCount} {projectCount === 1 ? 'Project' : 'Projects'}
            </p>
          </div>
        </div>
      </div>

      {/* Search and User Profile */}
      <div className="flex items-center gap-3 flex-1 max-w-md justify-end">
        {/* Search Bar */}
        <div className="relative w-full max-w-xs">
          <VscSearch
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#91A5BA] pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            suppressHydrationWarning
            className="
              w-full px-3 py-1.5 pl-8 rounded-lg
              bg-[#101A25] border border-[#1C3042]
              text-[13px] text-[#F2F5F7] placeholder:text-[#91A5BA]/50
              outline-none transition-all duration-150
              focus:border-[#4FA9FF] focus:ring-1 focus:ring-[#4FA9FF33]
            "
          />
        </div>

        {/* Admin User Profile Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#101A25] border border-[#1C3042] text-[#F2F5F7]">
          <div className="w-6 h-6 rounded-full bg-[#FFD52A] flex items-center justify-center text-[#070D14] text-[11px] font-black">
            A
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[12px] font-medium leading-none text-[#F2F5F7]">
              admin
            </span>
            <span className="text-[10px] text-[#91A5BA] leading-none mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#55D98A]" />
              System Online
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
