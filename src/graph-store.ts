
export interface ListOfGraphs {
    get(url: string): any;
    put(url: string, graph: any): void;
}

export interface GraphStore {

    base: ListOfGraphs;
    users: ListOfGraphs;
    groups: ListOfGraphs;
    forums: ListOfGraphs;
    threads: ListOfGraphs;
}

