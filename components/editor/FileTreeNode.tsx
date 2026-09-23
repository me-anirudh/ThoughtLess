import { useState, memo } from "react";
import { VscChevronDown, VscChevronRight, VscFile, VscFolder } from "react-icons/vsc";
import { selectFileHandler } from "@/lib/client/file-selection";
import { useEditorStore } from "@/store/editor-store";

export const FileTreeNode = memo(function FileTreeNode({ node, depth = 0 }: { node: any; depth?: number }) {
    // Open top-level folders by default so files are visible immediately
    const [isOpen, setIsOpen] = useState(depth <= 1);
    const isFolder = node.isFolder;
    // Boolean selector: ONLY triggers re-render for the previously selected and newly selected file!
    const isSelected = useEditorStore((state) => !node.isFolder && state.selectedFile === node.path);

    const handleSelect = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isFolder) {
            setIsOpen(!isOpen);
        } else {
            const bucketName = useEditorStore.getState().bucketName;
            selectFileHandler(node.path, bucketName);
        }
    };

    return (
        <div className="flex flex-col w-full text-[13px] text-[#d6deeb] font-sans select-none" onClick={handleSelect}>
            <div
                className={`flex items-center py-[3px] cursor-pointer group outline-none transition-colors ${
                    isSelected ? "bg-[#0b2942] text-[#82aaff] font-semibold border-l-2 border-[#82aaff]" : "text-[#89a4bb] hover:bg-[#0e293f] hover:text-white border-l-2 border-transparent"
                }`}
                style={{ paddingLeft: `${depth * 14 + 6}px` }}
            >
                <span className="w-[20px] flex justify-center items-center text-[#5f7e97] opacity-80 group-hover:opacity-100">
                    {isFolder ? (isOpen ? <VscChevronDown size={15} /> : <VscChevronRight size={15} />) : ""}
                </span>

                <span className={`mr-[6px] text-[15px] flex items-center justify-center ${isFolder ? "text-[#ecc48d]" : "text-[#7fdbca]"}`}>
                    {isFolder ? <VscFolder /> : <VscFile />}
                </span>

                <span className="whitespace-nowrap overflow-hidden text-ellipsis tracking-wide mt-[1px]">
                    {node.name}
                </span>
            </div>

            {isFolder && isOpen && node.children && (
                <div>
                    {node.children.map((childNode: any) => (
                        <FileTreeNode key={childNode.path || childNode.name} node={childNode} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
});
