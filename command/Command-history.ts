export interface Command {
        execute() : void | Promise<void>; 
        undo() : void | Promise<void>;
}

export class CommandHistory {
        private history : Command[] = []; 
        private curridx : number = -1; 
        private readonly maxHistorySize: number = 50;

        async executeCommand(command : Command){
                await command.execute(); 

                this.history.splice(this.curridx + 1); 
                this.history.push(command);

                if (this.history.length > this.maxHistorySize) {
                        this.history.shift();
                } else {
                        this.curridx++; 
                }
        }

        async undo(){
                if (this.curridx < 0) return;
                const command = this.history[this.curridx]; 

                await command.undo(); 

                this.curridx --; 
        }


        async redo() {
                if(this.curridx >= this.history.length - 1)return ; 

                this.curridx++;
                const command = this.history[this.curridx]; 


                await command.execute(); 
        }

};

export const CommandManager = new CommandHistory(); 