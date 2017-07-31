import { fnDebug, getDebug } from './debug';
const debug = getDebug('rdf-export');

import * as $rdf from 'rdflib';
import { isUri } from 'valid-url';

import { FileSystemGraphStore } from './file-system-graph-store';
import { PhpbbPageType as PageType } from './phpbb-page-scrapper';

const RDF   = $rdf.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
const RDFS  = $rdf.Namespace("http://www.w3.org/2000/01/rdf-schema#");
const FOAF  = $rdf.Namespace("http://xmlns.com/foaf/0.1/");
const XSD   = $rdf.Namespace("http://www.w3.org/2001/XMLSchema#");
const SIOC  = $rdf.Namespace("http://rdfs.org/sioc/ns#");
const DC    = $rdf.Namespace("http://purl.org/dc/elements/1.1/");
const DCT   = $rdf.Namespace("http://purl.org/dc/terms/");
const VCARD = $rdf.Namespace("http://www.w3.org/2006/vcard/ns#");
const AS    = $rdf.Namespace("https://www.w3.org/ns/activitystreams#");

export class RdfExport {

    readonly DEFAULT_DIR = './out/';

    baseSym = null;

    constructor(private baseUrl, private graphStore = null) {
        fnDebug('RdfExport.constructor(%s, %s)', baseUrl, (graphStore)?'injectedGraphStore':'null');
        if (!this.graphStore) {
            this.graphStore = new FileSystemGraphStore(this.baseUrl, this.DEFAULT_DIR)
        }
        this.baseSym = $rdf.sym(this.baseUrl);
        const base = this.graphStore.base.get(this.baseUrl);
        base.add(this.baseSym, RDF('type'), SIOC('Site'));
        this.graphStore.base.put(this.baseUrl, base);
    }

    add(data): RdfExport {
        fnDebug('RdfExport.add(%s)', data);
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

    private addRoot(data): void {
        const base = this.graphStore.base.get(this.baseUrl);
        base.add(this.baseSym, DC('title'), $rdf.lit(data.title, 'cs'));
        this.graphStore.base.put(this.baseUrl, base);
    }
    
    private addUser(data): void {
        const foafSym = $rdf.sym(data.url+'#card')
        const userSym = $rdf.sym(data.url);
        const user = this.graphStore.users.get(data.url);

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
            const avatarSym = $rdf.sym(this.baseUrl+data.avatarSrc);
            user.add(foafSym, FOAF('img'), avatarSym);
            user.add(userSym, SIOC('avatar'), avatarSym);
        }
        if (data.age > 0) { user.add(foafSym, FOAF('age'), $rdf.lit(data.age, '', XSD('integer'))); }
        if (data.www) {
            const homepages = data.www.replace(/,/, ' ').replace(/\s+/, ' ').split(/ /);
            for (const homepage of homepages) {
                if (isUri(homepage)) {
                    user.add(foafSym, FOAF('homepage'), $rdf.sym(homepage));
                } else {
                    console.log('Invalid homepage "'+homepage+'" for user: "'+data.url+'".');
                }
            }
        }
        if (data.jabber) { user.add(foafSym, FOAF('jabberID'), $rdf.lit(data.jabber)); }
        if (data.icq) { user.add(foafSym, FOAF('icqChatID'), $rdf.lit(data.icq)); }

        if (data.address) {
            user.add(foafSym, RDF('type'), VCARD('Individual'));
            const addressSym = $rdf.sym(data.url+'#home');
            user.add(foafSym, VCARD('hasAddress'), addressSym);
            // TODO: address needs to be parsed and validated first
            user.add(addressSym, VCARD('street-address'), $rdf.lit(data.address,));
        }

        if (data.groups) {
            for (let groupId in data.groups) {
                user.add(userSym, SIOC('member_of'), $rdf.sym(data.groups[groupId]))
            }
        }

        this.graphStore.users.put(data.url, user);
    }

    private addGroup(data): void {
        let url = data.url;
        if (data.page && data.page > 0) {
            url = data.firstPageUrl;
        }
        const groupSym = $rdf.sym(url);
        const group = this.graphStore.groups.get(url);

        group.add(groupSym, RDF('type'), SIOC('Usergroup'));
        group.add(groupSym, DC('title'), $rdf.lit(data.title, 'cs'));

        let phpbbid = group.any(groupSym, SIOC('id'));
        if (!phpbbid) {
            phpbbid = $rdf.lit(data.phpbbid, '', XSD('integer'));
            group.add(groupSym, SIOC('id'), phpbbid);
        }

        for (const userUrl of data.users) {
            group.add(groupSym, SIOC('has_member'), $rdf.sym(userUrl));
        }
        this.graphStore.groups.put(url, group);
    }

    private addForum(data): void {
        let url = data.url;
        if (data.page && data.page > 0) {
            url = data.firstPageUrl;
        }
        const forumSym = $rdf.sym(url);

        const forum = this.graphStore.forums.get(url);
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
                const base = this.graphStore.base.get(this.baseUrl);
                base.add(this.baseSym, SIOC('host_of'), $rdf.sym(url));
                this.graphStore.base.put(this.baseUrl, base);
            } else {
                const parentForum = this.graphStore.forums.get(data.parentForumUrl);
                const parentForumSym = $rdf.sym(data.parentForumUrl);
                parentForum.add(parentForumSym, SIOC('parent_of'), forumSym);
                this.graphStore.forums.put(data.parentForumUrl, parentForum);
                forum.add(forumSym, SIOC('has_parent'), parentForumSym);
            }
        }

        this.graphStore.forums.put(url, forum);
    }

    private addThread(data): void {

        let url = data.url;
        if (data.page && data.page > 0) {
            url = data.firstPageUrl;
        }

        const threadSym = $rdf.sym(url);
        const thread = this.graphStore.threads.get(url);

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
                const base = this.graphStore.base.get(this.baseUrl);
                base.add(this.baseSym, SIOC('host_of'), threadSym);
                base.add(this.baseSym, SIOC('parent_of'), threadSym);
                this.graphStore.base.put(this.baseUrl, base);
            } else {
                const parentForum = this.graphStore.forums.get(data.parentForumUrl);
                const parentForumSym = $rdf.sym(data.parentForumUrl);
                parentForum.add(parentForumSym, SIOC('parent_of'), threadSym);
                this.graphStore.forums.put(data.parentForumUrl, parentForum);
                thread.add(threadSym, SIOC('has_parent'), parentForumSym);
            }
        }

        for (let post of data.posts) {
            const postSym = $rdf.sym(url+'#p'+post.phpbbid);
            thread.add(postSym, RDF('type'), SIOC('Post'));
            thread.add(postSym, SIOC('id'), $rdf.lit(post.phpbbid, '', XSD('Integer')));
            thread.add(postSym, DC('title'), $rdf.lit(post.title, 'cs'));
            thread.add(postSym, SIOC('has_container'), threadSym);
            thread.add(postSym, SIOC('has_creator'), $rdf.sym(post.authorUrl));
            thread.add(postSym, DCT('created'), $rdf.Literal.fromDate(new Date(post.created)));
            thread.add(postSym, SIOC('content'), $rdf.lit(post.content, 'cs'));

            for (const userSrc of post.likes) {
                const user = this.graphStore.users.get(userSrc);
                user.add($rdf.sym(userSrc), AS('Like'), postSym);
                this.graphStore.users.put(userSrc, user);
            }
        }
        this.graphStore.threads.put(url, thread);
    }
}