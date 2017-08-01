import { fnDebug, getDebug } from './debug';
const debug = getDebug('file-system-graph-store');

import { GraphStore, ListOfGraphs } from './graph-store';

import * as $rdf from 'rdflib';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import * as URL from 'url';

class CachedFile {

    public cached = Date.now();
    public touched = 1;
    private content;
    constructor(public filename) {}

    load(): string {
        this.touched++;
        this.cached = Date.now();
        if (!this.content) {
            this.content = $rdf.graph();
            if (fs.existsSync(this.filename)) {
                try {
                    this.unserializeFromFile(this.filename, this.content);
                } catch (err) {
                    console.log('Loading graph from file: "%s" failed. Error: "%s".', this.filename, err);
                }
            }
        }
        return this.content;
    }

    save(content): void {
        this.touched++;
        this.cached = Date.now();
        this.content = content;
    }

    flush(): void {
        try {
            this.serializeToFile(this.content, this.filename);
        } catch (err) {
            console.log('Saving graph go file: "%s" failed. Error: "%s".', this.filename, err);
        }
    }

    private unserializeFromFile(filename, graph) {
        return $rdf.parse(this.fileIn(filename), graph, 'http://localhost/', 'text/turtle');
    }

    private serializeToFile(graph, filename) {
        $rdf.serialize(null, graph, './', 'text/turtle', (err, data) => {
            if (err) {
                console.log(err);
            }
            this.fileOut(filename, data);
        });
    }

    private fileIn(filename: string): string {
        debug('fileIn("%s")', filename);
        return fs.readFileSync(filename).toString();
    }

    private fileOut(filename, data) {
        debug('fileOut("%s", ...)', filename);
        const dir = filename.substring(0, filename.lastIndexOf('/')+1);
        if (!fs.existsSync(dir)) {
            mkdirp.sync(dir);
        }
        fs.writeFileSync(filename, data);
    }

    static cachedSorter(f1: CachedFile, f2: CachedFile): number {
        if (f1.cached > f2.cached) return 1;
        if (f1.cached < f2.cached) return -1;
        return 0;
    }

    static touchSorter(f1: CachedFile, f2: CachedFile): number {
        if (f1.touched > f2.touched) return 1;
        if (f1.touched < f2.touched) return -1;
        return 0;
    }
}

export class FileSystemCache {

    private files = {};
    private n = 0;

    constructor(private maxFiles, private maxTtl) {}

    load(filename): string {
        if (!this.files[filename]) {
            this.files[filename] = new CachedFile(filename);
            this.n++;
        }
        const content = this.files[filename].load();
        this.tick();
        return content;
    }

    save(filename, content): void {
        if (!this.files[filename]) {
            this.files[filename] = new CachedFile(filename);
            this.n++;
        }
        this.files[filename].save(content);
        this.tick();
    }

    tick(): void {
        if (this.n > 0) {
            const treshold = (Date.now()) - this.maxTtl * 1000;
            for (const filename in this.files) {
                if (this.files[filename].cached < treshold) {
                    this.flushFile(filename);
                }
            }
        }
        if (this.n > this.maxFiles) {
            debug('cacheMaxFiles (%n) reached (%n).', this.maxFiles, this.n);
            const overflowFiles = [];
            Object.values(this.files)
                .sort(CachedFile.cachedSorter)
                .splice(0, this.maxFiles-this.n)
                .map((file: CachedFile) => {
                    overflowFiles.push(file.filename);
                });
            debug(overflowFiles);
            for (const filename of overflowFiles) {
                this.flushFile(filename);
            }
        }
    }

    flushFile(filename: string): void {
        fnDebug('FileSystemCache.flushFile("%s")', filename);
        this.files[filename].flush();
        delete this.files[filename];
        this.n--;
    }

    flush(): void {
        fnDebug('FileSystemCache.flush()');
        if (this.n > 0) {
            for (const filename in this.files) {
                this.flushFile(filename);
            }
        }
    }
}

export class FileSystemListOfGraphs implements ListOfGraphs {

    constructor(private dir: string, private baseUrl: string, private fsCache: FileSystemCache) {}

    get(url: string): any {
        fnDebug('get(%s)', url);
        return this.fsCache.load(this.urlToFile(url));
    }

    put(url: string, graph: any): void {
        fnDebug('put(%s, graph)', url);
        this.fsCache.save(this.urlToFile(url), graph);
    }

    private urlToFile(url: string): string {
        if (url == this.baseUrl) {
            return this.dir + 'index.ttl';
        }
        return this.dir + url
            .replace(this.baseUrl, '')
            .replace(/(.html|\/)$/, '.ttl');
    }
}


export class FileSystemGraphStore implements GraphStore {

    base = null;
    users = null;
    groups = null;
    forums = null;
    threads = null;

    private dirs = {
        base: null,
        users: null,
        groups: null,
        forums: null,
        threads: null
    }

    constructor(private baseUrl: string, private dir: string = './out/', private fsCache: FileSystemCache = null) {
        fnDebug('FileSystemGraphStore.constructor("%s", "%s")', baseUrl, dir);
        this.setDir(this.dir);
        if (!this.fsCache) {
            this.fsCache = new FileSystemCache(1000, 1800); // max 1000 files. max 30 minutes
        }
    }

    setDir(dir): FileSystemGraphStore {
        fnDebug('FileSystemGraphStore.setDir("%s")', dir);
        this.dir = dir;
        this.dirs.base = this.dir+URL.parse(this.baseUrl).hostname+'/';
        for (const listOfGraphs of [ 'base', 'users', 'groups', 'forums', 'threads' ]) {
            this.dirs[listOfGraphs] = this.dirs.base;
            this[listOfGraphs] = new FileSystemListOfGraphs(this.dirs[listOfGraphs], this.baseUrl, this.fsCache);
            mkdirp.sync(dir);
        }
        return this;
    }

    quit(): void {
        this.fsCache.flush();
    }
}