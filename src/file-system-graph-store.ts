import { fnDebug, getDebug } from './debug';
const debug = getDebug('file-system-graph-store');

import { GraphStore, ListOfGraphs } from './graph-store';

import * as $rdf from 'rdflib';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import * as URL from 'url';

export class FileSystemListOfGraphs implements ListOfGraphs {

    constructor(private dir, private baseUrl) {}

    get(url: string): any {
        fnDebug('get(%s)', url);
        let graph = $rdf.graph();
        const filename = this.urlToFile(url);
        if (fs.existsSync(filename)) {
            try {
                this.unserializeFromFile(filename, graph);
            } catch (err) {
                console.log('Loading graph "%s" from file: "%s" failed. Error: %s', url, filename, err);
            }
        }
        return graph;
    }

    put(url: string, graph: any): void {
        fnDebug('put(%s, graph)', url);
        const filename = this.urlToFile(url);
        try {
            this.serializeToFile(graph, filename);
        } catch (err) {
            console.log('Saving graph "%s to file: "%s" failed. Error: "%s"', url, filename, err);
        }
    }

    private urlToFile(url: string): string {
        if (url == this.baseUrl) {
            return this.dir + 'index.ttl';
        }
        return this.dir + url
            .replace(this.baseUrl, '')
            .replace(/(.html|\/)$/, '.ttl');
    }

    private fileIn(file: string): string {
        return fs.readFileSync(file).toString();
    }

    private fileOut(file, data) {
        const dir = file.substring(0, file.lastIndexOf('/')+1);
        if (!fs.existsSync(dir)) {
            mkdirp.sync(dir);
        }
        fs.writeFileSync(file, data);
    }

    private unserializeFromFile(filename, graph) {
        return $rdf.parse(this.fileIn(filename), graph, 'http://localhost/', 'text/turtle');
    }

    private serialize(graph, cb) {
        $rdf.serialize(null, graph, './', 'text/turtle', cb);
    }

    private serializeToFile(graph, filename) {
        this.serialize(graph, (err, data) => {
            if (err) {
                console.log(err);
            }
            this.fileOut(filename, data);
        });
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

    constructor(private baseUrl: string, private dir: string = './out/') {
        fnDebug('FileSystemGraphStore.constructor("%s", "%s")', baseUrl, dir);
        this.setDir(this.dir);
    }

    setDir(dir): FileSystemGraphStore {
        fnDebug('FileSystemGraphStore.setDir("%s")', dir);
        this.dir = dir;
        this.dirs.base = this.dir+URL.parse(this.baseUrl).hostname+'/';
        for (const listOfGraphs of [ 'base', 'users', 'groups', 'forums', 'threads' ]) {
            this.dirs[listOfGraphs] = this.dirs.base;
            this[listOfGraphs] = new FileSystemListOfGraphs(this.dirs[listOfGraphs], this.baseUrl);
            mkdirp.sync(dir);
        }
        return this;
    }

}