"use client";
// import { useState } from "react";
// import { useActiveFile }  from "@/store/activitybar-store";
import {
        VscFiles,
        VscSourceControl,
        VscDebugAlt,
        VscAccount,
        VscSettingsGear,
        VscHome
} from "react-icons/vsc";
import type { ActivityBarIcon } from "@/types/interfaces";
import { useActiveFile } from "@/store/activitybar-store";
import { useRouter } from "next/navigation";

const topElements: ActivityBarIcon[] = [
        { icon: VscFiles, tooltip: "Explorer", id : "files" },
        { icon: VscSourceControl, tooltip: "Thought Threads", id: "graph"},
        { icon: VscDebugAlt, tooltip: "Run and Debug", id : "play"},
        
];

const bottomElements: ActivityBarIcon[] = [
        { icon: VscAccount, tooltip: "Accounts", id : "profile" },
        { icon: VscSettingsGear, tooltip: "Settings", id : "gear" }
];

export default function ActivityBar() {
        const router = useRouter();
        const activeId = useActiveFile((state) => state.id);
        const setActive = useActiveFile((state) => state.setId); 

        return (
                <aside className="bg-[#01111d] w-12 h-screen flex flex-col justify-between items-center py-1 border-r border-[#122d42] select-none">
                        <div className="flex flex-col items-center w-full">
                                {/* Dashboard / Home Icon */}
                                <div
                                        onClick={() => router.push('/')}
                                        title="Projects Dashboard"
                                        className="flex justify-center items-center w-full py-3 text-[22px] text-[#82aaff] hover:text-white cursor-pointer transition-colors duration-150 border-b border-[#122d42] mb-1"
                                >
                                        <VscHome />
                                </div>

                                {topElements.map((element) => {
                                       const Icon = element.icon;
                                       const isActive = activeId === element.id;
                                
                                        return (
                                                <div 
                                                        key={element.id} 
                                                        className={`flex justify-center items-center w-full py-3 text-[24px] cursor-pointer transition-colors duration-150
                                                                ${isActive 
                                                                        ? "text-[#82aaff] border-l-2 border-[#82aaff] bg-[#0b2942]" 
                                                                        : "text-[#5f7e97] hover:text-white border-l-2 border-transparent"
                                                                }`} 
                                                        onClick={() => setActive(isActive ? "" : element.id)}
                                                        title={element.tooltip}
                                                >
                                                        <Icon />
                                                </div>
                                        );
                                })}
                        </div>
                        <div className="flex flex-col items-center w-full">
                                {bottomElements.map((element) => {
                                        const Icon = element.icon;
                                        return (
                                                <div 
                                                        key={element.id} 
                                                        className="flex justify-center items-center w-full py-3 text-[24px] text-[#5f7e97] hover:text-white cursor-pointer transition-colors duration-150" 
                                                        title={element.tooltip}
                                                >
                                                        <Icon />
                                                </div>
                                        );
                                })}
                        </div>
                </aside>
        );
}
