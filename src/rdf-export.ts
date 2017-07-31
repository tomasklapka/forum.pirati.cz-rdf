import { fnDebug, getDebug } from './debug';
let debug = getDebug('rdf-add');

import { Namespace } from 'rdflib';
import * as $rdf from 'rdflib';

import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import * as URL from 'url';
import { join, basename } from 'path';
import { isUri } from 'valid-url';

import { PhpbbPageType as PageType } from './phpbb-page-scrapper';

const RDF   = Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
const RDFS  = Namespace("http://www.w3.org/2000/01/rdf-schema#");
const FOAF  = Namespace("http://xmlns.com/foaf/0.1/");
const XSD   = Namespace("http://www.w3.org/2001/XMLSchema#");
const SIOC  = Namespace("http://rdfs.org/sioc/ns#");
const DC    = Namespace("http://purl.org/dc/elements/1.1/");
const DCT   = Namespace("http://purl.org/dc/terms/");
const VCARD = Namespace("http://www.w3.org/2006/vcard/ns#");
const AS    = Namespace("https://www.w3.org/ns/activitystreams#");

export class RdfExport {

    outDir = './out/';
    baseDir = null;
    usersDir = null;
    groupsDir = null;
    forumsDir = null;
    threadsDir = null;

    base = null;
    mirrorBase = null;

    rootSym = null;
    root = null;
    users = {};
    groups = {};
    threads = {};
    forums = {};

    constructor(private baseUrl) {
        this.root = $rdf.graph();
        this.rootSym = $rdf.sym(baseUrl);
        this.root.add(this.rootSym, RDF('type'), SIOC('Site'));
    }

    add(data): RdfExport {
        switch (data.type) {
            case PageType.Root:
                this.addRoot(data); break;
            case PageType.User:
                this.addUser(data); break;
            case PageType.Group:
                this.addGroup(data); break;
            case PageType.Forum:
                this.addForum(data); break;
            case PageType.Thread:
                this.addThread(data); break;
        }
        return this;
    }

    setOutDir(outDir): RdfExport {
        fnDebug('setOutDir('+outDir+')');
        this.outDir = outDir;
        this.base = URL.parse(this.baseUrl);
        for (let dir of [
            this.baseDir = this.outDir+this.base.hostname+'/',
            this.usersDir = this.baseDir,//+'users/',
            this.groupsDir = this.baseDir,//+'groups/',
            this.forumsDir = this.baseDir,//+'forums/',
            this.threadsDir = this.baseDir,//+'threads/'
        ]) {
            try { fs.mkdirSync(dir); } catch (e) {}
        }
        this.mirrorBase = './'+this.base.hostname+'/';
        return this;
    }

    private ls(dir: string): any {
        let files = [];
        let directories = [];
        let list = fs.readdirSync(dir);
        list.forEach((element) => {
            const fullPath = join(dir, element);
            if (fs.lstatSync(fullPath).isDirectory()) {
                directories.push(fullPath);
            } else {
                if (/\.ttl$/.exec(fullPath))
                    files.push(fullPath);
            }
        })
        return {
            files: files,
            directories: directories
        }
    }

    load(loadDir?: string): void {
        fnDebug('load('+loadDir+')');
        if (!fs.existsSync(loadDir)) return;
        if (!loadDir) loadDir = this.outDir;
        const list = this.ls(loadDir);
        for (const file of list.files) {
            const graph = $rdf.graph();
            try {
                $rdf.parse(this.fileIn('./'+file), graph, 'http://localhost/', 'text/turtle');
            } catch (err) {
                console.log(err);
            }
            const filename = basename(file);
            const type = /-([ugft])\d+.ttl$/.exec(filename);
            if (type && type[1]) {
                const url = graph.any().value;
                switch (type[1]) {
                    case 'u':
                        this.users[url] = graph; break;
                    case 'g':
                        this.groups[url] = graph; break;
                    case 't':
                        this.threads[url] = graph; break;
                    case 'f':
                        this.forums[url] = graph; break;
                }
            } else {
                if (filename == 'site.ttl') {
                    this.root = graph;
                }
            }
        }
        for (let dir of list.directories) {
            this.load(dir);
        }
    }

    stats() {
        let stats = '';
        stats += '\tusers:\t\t' +Object.keys(this.users).length   +'\n';
        stats += '\tgroups:\t\t'+Object.keys(this.groups).length  +'\n';
        stats += '\tforums:\t\t'+Object.keys(this.forums).length  +'\n';
        stats += '\tthreads:\t' +Object.keys(this.threads).length;
        return stats;
    }

    save(outDir?: string) {
        fnDebug('save('+outDir+')');
        if (outDir) { this.setOutDir(outDir); }
        this.saveRoot();
        for (let user in this.users) {
            this.saveUser(user);
        }
        for (let group in this.groups) {
            this.saveGroup(group);
        }
        for (let forum in this.forums) {
            this.saveForum(forum);
        }
        for (let thread in this.threads) {
            this.saveThread(thread);
        }
    }

    saveRoot(): void {
        this.serializeToFile(this.root, this.baseDir+'site.ttl');
    }

    saveUser(userUrl: string): void {
        let filename = userUrl.replace(this.baseUrl, '').replace(/\/$/, '.ttl');
        this.serializeToFile(this.users[userUrl], this.usersDir+filename);
    }

    saveGroup(groupUrl: string): void {
        let filename = groupUrl.replace(this.baseUrl, '').replace('.html','.ttl');
        this.serializeToFile(this.groups[groupUrl], this.groupsDir+filename);
    }

    saveForum(forumUrl: string): void {
        let filename = forumUrl.replace(this.baseUrl, '').replace(/\/$/, '.ttl');
        this.serializeToFile(this.forums[forumUrl], this.forumsDir+filename);
    }

    saveThread(threadUrl: string): void {
        let filename = threadUrl.replace(this.baseUrl, '').replace('.html', '.ttl');
        this.serializeToFile(this.threads[threadUrl], this.threadsDir+filename);
    }

    private addRoot(data): void {
        this.root.add(this.rootSym, DC('title'), $rdf.lit(data.title, 'cs'));
    }
    
    private addUser(data): void {
        const foafSym = $rdf.sym(data.url+'#card')
        const userSym = $rdf.sym(data.url);
        let user = this.users[data.url];
        if (!user) user = $rdf.graph();

        user.add(userSym, RDF('type'), SIOC('UserAccount'));
        user.add(userSym, FOAF('accountName'), $rdf.lit(data.username));
        user.add(userSym, DCT('created'), $rdf.Literal.fromDate(new Date(data.registered)));
        user.add(userSym, SIOC('id'), $rdf.lit(data.phpbbid, '',XSD('integer')));
        if (data.lastVisit) { user.add(userSym, SIOC('last_activity_date'), $rdf.Literal.fromDate(new Date(data.lastVisit))); }
        if (data.signature) { user.add(userSym, DC('description'), $rdf.lit(data.signature, 'cs')); }
        user.add(userSym, SIOC('account_of'), foafSym);

        user.add(foafSym, RDF('type'), FOAF('Person'));
        user.add(foafSym, FOAF('account'), userSym);
        user.add(foafSym, FOAF('nick'), $rdf.lit(data.username));
        if (data.avatarSrc) {
            let avatarSym = $rdf.sym(this.baseUrl+data.avatarSrc);
            user.add(foafSym, FOAF('img'), avatarSym);
            user.add(userSym, SIOC('avatar'), avatarSym);
        }
        if (data.age > 0) { user.add(foafSym, FOAF('age'), $rdf.lit(data.age, '', XSD('integer'))); }
        if (data.www) {
            if (isUri(data.www)) {
                user.add(foafSym, FOAF('homepage'), $rdf.sym(data.www));
            } else {
                console.log('Invalid homepage "'+data.www+'" for user: "'+data.uri+'".');
            }
        }
        if (data.jabber) { user.add(foafSym, FOAF('jabberID'), $rdf.lit(data.jabber)); }
        if (data.icq) { user.add(foafSym, FOAF('icqChatID'), $rdf.lit(data.icq)); }

        if (data.address) {
            user.add(foafSym, RDF('type'), VCARD('Individual'));
            let addressSym = $rdf.sym(data.url+'#home');
            user.add(foafSym, VCARD('hasAddress'), addressSym);
            // TODO: address needs to be parsed and validated first
            user.add(addressSym, VCARD('street-address'), $rdf.lit(data.address,));
        }

        if (data.groups) {
            for (let groupId in data.groups) {
                user.add(userSym, SIOC('member_of'), $rdf.sym(data.groups[groupId]))
            }
        }

/*
        signature: data.signature,
        rank: data.rank,
        occupation: data.occupation,
        defaultGroup: data.defaultGroup,
        interests: data.interests,
        profession: data.profession,
        totalPosts: data.totalPosts,
        likesGot: data.likesGot,
        likesGave: data.likesGave,
        showOnMap: data.showOnMap
*/
        this.users[data.url] = user;
    }

    private addGroup(data): void {
        let url = data.url;
        if (data.page && data.page > 0) {
            url = data.firstPageUrl;
        }
        const groupSym = $rdf.sym(url);
        let group = this.groups[url];
        if (!group) group = $rdf.graph();

        group.add(groupSym, RDF('type'), SIOC('Usergroup'));
        group.add(groupSym, DC('title'), $rdf.lit(data.title, 'cs'));

        let phpbbid = group.any(groupSym, SIOC('id'));
        if (!phpbbid) {
            phpbbid = $rdf.lit(data.phpbbid, '', XSD('integer'));
            group.add(groupSym, SIOC('id'), phpbbid);
        }

        for (let userUrl of data.users) {
            group.add(groupSym, SIOC('has_member'), $rdf.sym(userUrl));
        }
        this.groups[url] = group;
    }

    private addForum(data): void {
        let url = data.url;
        if (data.page && data.page > 0) {
            url = data.firstPageUrl;
        }
        const forumSym = $rdf.sym(url);
        let forum = this.forums[url];
        if (!forum) forum = $rdf.graph();
        forum.add(forumSym, RDF('type'), SIOC('Forum'));
        forum.add(forumSym, DC('title'), $rdf.lit(data.title, 'cs'));
        forum.add(forumSym, SIOC('has_host'), $rdf.sym(this.baseUrl));

        let phpbbid = forum.any(forumSym, SIOC('id'));
        if (!phpbbid) {
            phpbbid = $rdf.lit(data.phpbbid, '', XSD('integer'));
            forum.add(forumSym, SIOC('id'), phpbbid);
        }

        if (data.parentForumUrl) {
            if (data.parentForumUrl == this.baseUrl) {
                this.root.add(this.rootSym, SIOC('host_of'), $rdf.sym(url));
            } else {
                let parentForum = this.forums[data.parentForumUrl];
                if (!parentForum) parentForum = $rdf.graph();
                let parentForumSym = $rdf.sym(data.parentForumUrl);
                parentForum.add(parentForumSym, SIOC('parent_of'), forumSym);
                this.forums[data.parentForumUrl] = parentForum;
                forum.add(forumSym, SIOC('has_parent'), parentForumSym);
            }
        }

        this.forums[url] = forum;
    }

    private addThread(data): void {
        let url = data.url;
        if (data.page && data.page > 0) {
            url = data.firstPageUrl;
        }
        const threadSym = $rdf.sym(url);
        let thread = this.threads[url];
        if (!thread) thread = $rdf.graph();

        thread.add(threadSym, RDF('type'), SIOC('Thread'));
        thread.add(threadSym, DC('title'), $rdf.lit(data.title, 'cs'));
        thread.add(threadSym, SIOC('has_host'), $rdf.sym(this.baseUrl));

        let phpbbid = thread.any(threadSym, SIOC('id'));
        if (!phpbbid) {
            phpbbid = $rdf.lit(data.phpbbid, '', XSD('integer'));
            thread.add(threadSym, SIOC('id'), phpbbid);
        }

        if (data.parentForumUrl) {
            if (data.parentForumUrl == this.baseUrl) {
                this.root.add(this.rootSym, SIOC('host_of'), threadSym);
                this.root.add(this.rootSym, SIOC('parent_of'), threadSym);
            } else {
                let parentForum = this.forums[data.parentForumUrl];
                if (!parentForum) parentForum = $rdf.graph();
                let parentForumSym = $rdf.sym(data.parentForumUrl);
                parentForum.add(parentForumSym, SIOC('parent_of'), threadSym);
                this.forums[data.parentForumUrl] = parentForum;
                thread.add(threadSym, SIOC('has_parent'), parentForumSym);
            }
        }

        for (let post of data.posts) {
            let postSym = $rdf.sym(url+'#p'+post.phpbbid);
            thread.add(postSym, RDF('type'), SIOC('Post'));
            thread.add(postSym, SIOC('id'), $rdf.lit(post.phpbbid, '', XSD('Integer')));
            thread.add(postSym, DC('title'), $rdf.lit(post.title, 'cs'));
            thread.add(postSym, SIOC('has_container'), threadSym);
            thread.add(postSym, SIOC('has_creator'), $rdf.sym(post.authorUrl));
            thread.add(postSym, DCT('created'), $rdf.Literal.fromDate(new Date(post.created)));
            thread.add(postSym, SIOC('content'), $rdf.lit(post.content, 'cs'));

            for (let userSrc of post.likes) {
                let user = this.users[userSrc];
                if (!user) user = $rdf.graph();
                user.add($rdf.sym(userSrc), AS('Like'), postSym);
                this.users[userSrc] = user;
            }

        }

        this.threads[url] = thread;
    }

    private fileIn(file: string): string {
        return fs.readFileSync(file).toString();
    }

    private fileOut(where, what) {
        let dir = where.substring(0, where.lastIndexOf('/')+1);
        if (!fs.existsSync(dir)) {
            mkdirp.sync(dir);
        }
        fs.writeFileSync(where, what);
    }

    private serialize(graph, cb) {
        $rdf.serialize(null, graph, this.mirrorBase, 'text/turtle', cb);
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