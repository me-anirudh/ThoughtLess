"use client";

import { useState, useEffect } from "react";
import { useFilterStore } from "@/store/filter-store";
import { CommandManager } from "@/command/Command-history";
import { FilterCommand } from "@/command/highlight-command";
import { CommitCategory } from "@/types/interfaces";
import { VscSearch, VscListSelection } from "react-icons/vsc";

// The beautiful categories you set up!
const CATEGORIES: { value: CommitCategory; label: string; icon: string }[] = [
    { value: 'feature', label: 'Feature', icon: '✨' },
    { value: 'bugfix', label: 'Bugfix', icon: '🐛' },
    { value: 'refactor', label: 'Refactor', icon: '♻️' },
    { value: 'docs', label: 'Docs', icon: '📚' },
    { value: 'chore', label: 'Chore', icon: '🔧' },
    { value: 'merge', label: 'Merge', icon: '🔀' },
    { value: 'unknown', label: 'Unknown', icon: '❓' },
];

export default function GraphSearch() {
    // 1. Pull the actual applied state from the store
    const storeQuery = useFilterStore(state => state.searchQuery);
    const storeCategories = useFilterStore(state => state.activeCategories);
    
    // 2. Keep local fast-typing state so the input doesn't lag
    const [localQuery, setLocalQuery] = useState(storeQuery);
    
    // We'll treat an empty array from the store as "all" for the dropdown
    const [localCategory, setLocalCategory] = useState<CommitCategory | "all">(
        storeCategories.length > 0 ? storeCategories[0] : "all"
    );

    // Sync local state when store changes externally (e.g., undo/redo)
    useEffect(() => {
        setLocalQuery(storeQuery);
    }, [storeQuery]);

    useEffect(() => {
        setLocalCategory(storeCategories.length > 0 ? storeCategories[0] : "all");
    }, [storeCategories]);

    // 3. The master function that creates and executes the Command
    const handleApplyFilter = (newSearchQuery: string, newCategoryValue: CommitCategory | "all") => {
        // If they select "all", pass an empty array (which means don't filter by category)
        const newCats: CommitCategory[] = newCategoryValue === "all" ? [] : [newCategoryValue];
        
        // Instantiate the command with both the OLD state and the NEW state!
        const cmd = new FilterCommand(
            storeQuery,
            newSearchQuery,
            storeCategories,
            newCats
        );
        
        CommandManager.executeCommand(cmd);
    };

    
    const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalQuery(e.target.value);
    };

    const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Apply the search command only when they hit Enter!
        if (e.key === 'Enter') {
            handleApplyFilter(localQuery, localCategory);
        }
    };

    const onCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value as CommitCategory | "all";
        setLocalCategory(val);
        // Apply instantly when they change the dropdown
        handleApplyFilter(localQuery, val); 
    };

    return (
        <div className="flex items-center gap-2 bg-[#01111d] p-3 border-b border-[#122d42]">
            
            {/* Search Input */}
            <div className="relative flex-1">
                <VscSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5f7e97]" />
                <input
                    type="text"
                    value={localQuery}
                    onChange={onSearchChange}
                    onKeyDown={onSearchKeyDown}
                    placeholder="Search commits by message (Press Enter)..."
                    suppressHydrationWarning
                    className="
                        w-full bg-[#0b253a] border border-[#1f384c] text-[#d6deeb] text-[13px] 
                        placeholder:text-[#5f7e97]
                        rounded-md py-1.5 pl-8 pr-3 outline-none 
                        focus:border-[#82aaff] focus:ring-1 focus:ring-[#82aaff33] transition-colors
                    "
                />
            </div>
            
            {/* Category Dropdown */}
            <div className="relative w-48">
                <VscListSelection className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5f7e97] pointer-events-none" />
                <select
                    value={localCategory}
                    onChange={onCategoryChange}
                    className="
                        w-full bg-[#0b253a] border border-[#1f384c] text-[#d6deeb] text-[13px] 
                        rounded-md py-1.5 pl-8 pr-8 outline-none 
                        focus:border-[#82aaff] appearance-none cursor-pointer transition-colors
                    "
                >
                    <option value="all">🌍 All Tags</option>
                    {CATEGORIES.map(cat => (
                        <option key={cat.value} value={cat.value}>
                            {cat.icon} {cat.label}
                        </option>
                    ))}
                </select>
                {/* Custom dropdown arrow */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5f7e97] pointer-events-none">
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </div>
            </div>

        </div>
    );
}