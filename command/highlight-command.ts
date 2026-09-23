// Note: This file exports FilterCommand. Originally named for highlighting behavior.
// The command handles both search query and category filter changes.
import { Command } from "./Command-history";
import { useFilterStore } from "@/store/filter-store";
import { CommitCategory } from "@/types/interfaces";

export class FilterCommand implements Command {
    private oldQuery: string;
    private newQuery: string;
    private oldCategories: CommitCategory[];
    private newCategories: CommitCategory[];

    constructor(
        oldQuery: string, 
        newQuery: string, 
        oldCategories: CommitCategory[], 
        newCategories: CommitCategory[]
    ) {
        this.oldQuery = oldQuery;
        this.newQuery = newQuery;
        this.oldCategories = [...oldCategories];
        this.newCategories = [...newCategories];
    }

    execute() {
        useFilterStore.setState({ 
            searchQuery: this.newQuery,
            activeCategories: this.newCategories 
        });
    }

    undo() {
        useFilterStore.setState({ 
            searchQuery: this.oldQuery,
            activeCategories: this.oldCategories 
        });
    }
}