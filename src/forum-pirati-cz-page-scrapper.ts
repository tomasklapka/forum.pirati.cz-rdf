import { PhpbbPageScrapper, PhpbbPageType as PageType } from './phpbb-page-scrapper';

import { fnDebug, getDebug } from './debug';
let debug = getDebug('forum-pirati-cz-page-scrapper');

import { remove as removeDiacritics } from 'diacritics';
import * as requestExt from 'request-extensible';
import * as RequestHttpCache from 'request-http-cache';
import * as cheerio from 'cheerio';
import * as origRequest from 'request';
import * as URL from 'url';

export let httpRequestCache = new RequestHttpCache({
    backend: 'redis',
    redis: {
        host: '127.0.0.1',
        port: '6379'
    },
    ttl: 86400
});

const rootUrl = new RegExp(/^https?:\/\/[^\/]+\/$/);
const forumUrl = new RegExp(/^http.*\-f(\d+)\/$/);
const forumPageUrl = new RegExp(/^http.*\-f(\d+)\/page(\d+).html$/);
const threadUrl = new RegExp(/^http.*\-t(\d+)\.html$/);
const threadPageUrl = new RegExp(/^http.*\-t(\d+)(\-\d+)?\.html$/);
const postUrl = new RegExp(/^http.*\.html#p(\d+)\/$/);
const userUrl = new RegExp(/^http.*\-u(\d+)\/$/);
const groupUrl = new RegExp(/^http.*\-g(\d+).html$/);
const groupPageUrl = new RegExp(/^http.*\-g(\d+)\-(\d+).html$/);

let defaultRequest = origRequest.defaults({ jar : true })

function requestWithFakeResponseHeaders(options, callback) {
    defaultRequest(options, (error, response, body) => {
        if (!error && response && response.headers) {
            response.headers.etag = (new Date(new Date().toJSON().slice(0,10)+' 00:00:00')).getTime();
            response.headers['pragma'] = '';
            response.headers['cache-control'] = "max-age=86400";
            response.headers['expires'] = Date.now() + 86400;
        }
        callback(error, response, body);
    });
}

export let request = requestExt({
    request: requestWithFakeResponseHeaders,
    extensions: [ httpRequestCache.extension ]
});

export class ForumPiratiCzPageScrapper implements PhpbbPageScrapper {

    type: number = null;
    phpbbid: number = null;
    forumUrl: string = null;
    parentForumUrl: string = null;
    title: string = null;
    links: any[] = [];
    posts: any[] = [];
    users: string[] = [];
    page: number = null;
    firstPageUrl: string = null;

    // user data
    username: string = null;
    signature: string = null;
    avatarSrc: string = null;
    rank: string = null;
    address: string = null;
    age: number = null;
    occupation: string = null;
    defaultGroup: string = null;
    groups: {} = {};
    interests: string = null;
    profession: string = null;
    icq: number = null;
    www: string = null;
    jabber: string = null;
    registered: string = null;
    lastVisit: string = null;
    totalPosts: number = null;
    likesGot: number = null;
    likesGave: number = null;
    showOnMap: boolean = false;

    private resolve = null;
    private reject = null;
    private $ = null;

    constructor(public readonly url: string) {};

    scrap(): Promise<ForumPiratiCzPageScrapper> {
        fnDebug('scrap()');
        this.type = ForumPiratiCzPageScrapper.linkType(this.url);
        return new Promise((resolve, reject) => {
            if (this.resolve || this.reject) { reject('scrap not finished yet'); }
            this.resolve = resolve;
            this.reject = reject;
            request({ url: this.url }, (err, response, body): void => {
                if (err) this.reject(err);
                if (!body) this.reject('no content');
                this.$ = cheerio.load(body);
                this.scrapLinks();
                this.scrapParent();
                this.scrapPagination();
                switch (this.type) {
                    case PageType.Root:
                        this.title = this.$('title').text();
                    case PageType.Forum:
                        this.scrapForum(); break;
                    case PageType.Thread:
                        this.scrapThread(); break;
                    case PageType.User:
                        this.scrapUser(); break;
                    case PageType.Group:
                        this.scrapGroup(); break;
                };
                this.$ = null;
                setTimeout(()=>{
                    this.resolve(this);
                }, 100);
            });
        });
    }

    static login(loginUrl: string, username: string, password: string): Promise<any> {
        fnDebug('ForumPiratiCzPageScrapper.login('+loginUrl+', '+username+', ***invisible***)');
        return new Promise((resolve, reject) => {
            if (!username || !password || !loginUrl) resolve(null);
            defaultRequest({
                url: loginUrl,
                method: 'POST',
                form: {
                    username: username,
                    password: password,
                    viewonline: 'on',
                    login: 'Přihlásit se'
                }
            }, (error, response, body) => {
                if (error) {
                    debug(error);
                    reject(error);
                }
                resolve(response);
            });
            
        });
    }

    static quit(): PhpbbPageScrapper {
        fnDebug('ForumPiratiCzPhpbbPageScrapper.quit()');
        return httpRequestCache.backend.redisClient.quit()
    }

    static linkType(url): PageType {
        if (!url) return PageType.None;
        if (forumUrl.exec(url)) { return PageType.Forum; }
        if (forumPageUrl.exec(url)) { return PageType.Forum; }
        if (threadUrl.exec(url)) { return PageType.Thread; }
        if (threadPageUrl.exec(url)) { return PageType.Thread; }
        if (postUrl.exec(url)) { return PageType.Post; }
        if (userUrl.exec(url)) { return PageType.User; }
        if (groupUrl.exec(url)) { return PageType.Group; }
        if (groupPageUrl.exec(url)) { return PageType.Group; }
        if (rootUrl.exec(url)) { return PageType.Root; }
        return PageType.None;
    }

    private scrapLinks(): void {
        fnDebug('scrapLinks()');
        this.$('a').each((i, a) => {
            const linkUrl = this.$(a).attr('href');
            const type = ForumPiratiCzPageScrapper.linkType(this.$(a).attr('href'));
            if ((linkUrl || typeof linkUrl === typeof 'string') && type !== PageType.None) {
                this.links.push({
                    title: this.$(a).text(),
                    url: linkUrl.replace(/#wrap$/, ''),
                    type: type
                });
            }
        });
    }

    private scrapParent(): void {
        fnDebug('scrapParent()');
        let linkPath = this.$('div#page-header').children('div.navbar').children('div.inner').children('ul.navlinks')
                        .children('li.icon-home').children('a');
        this.forumUrl = linkPath.last().attr('href');
        if (linkPath.length > 1) {
            this.parentForumUrl = linkPath.last().prev().prev().attr('href');
        }
    }

    private scrapForum(): void {
        fnDebug('scrapForum()');
        this.phpbbid = this.forumIdFromUrl(this.url);
        let title = this.$('div#page-body').children("h2").text();
        if (title) {
            this.title = title;
        }
    }

    private scrapUser(): void {
        fnDebug('scrapUser()');
        this.phpbbid = this.userIdFromUrl(this.url);
        this.title = this.$('dl.details').first().children('dd').children('span').text();
        this.signature = this.$('.signature').html();

        let userBody = this.$('form#viewprofile').children('div.panel')
        let userBodyPanel1 = userBody.first().children('div.inner').children('dl');
        this.avatarSrc = userBodyPanel1.first().children('dt').children('img').first().attr('src');
        this.rank = userBodyPanel1.first().children('dd').text();
        if (this.rank.length == 0) { this.rank = null; }
        let detailsBody = userBodyPanel1.first();
        if (this.avatarSrc) {
            detailsBody = detailsBody.next();
        }
        detailsBody.children('dt').each((i, e) => {
            let dd = this.$(e).next();
            switch (this.$(e).text()) {
                case 'Uživatelské jméno:':
                    this.username = dd.children('span').text();
                    break;
                case 'Bydliště:':
                    this.address = dd.text(); break;
                case 'Věk:':
                    this.age = dd.text(); break;
                case 'Skupiny:':
                    dd.children('select').children('option').each((j, o) => {
                        const option = this.$(o);
                        const id = option.attr('value');
                        const groupUrl = this.makeGroupUrl(id, option.text());
                        if (option.attr('selected') == 'selected') {
                            this.defaultGroup = groupUrl;
                        }
                        this.groups[id] = groupUrl;
                    });
                case 'Profese:':
                    this.profession = dd.text(); break;
                case 'Zájmy:':
                    this.interests = dd.text(); break;
                case 'Povolání:':
                    this.occupation = dd.text(); break;
                case 'Zobrazit bydliště na mapě:':
                    this.showOnMap = (dd.text() == 'Ano') ? true : false;
                    break;
                case 'Hodnost:':
                    this.rank = dd.text(); break;
            }
        })
        let userBodyPanel2 = userBody.first().next().children('div.inner');
        userBodyPanel2.children('div.column1').children('dl.details').children('dt').each((i, e) => {
            let dd = this.$(e).next();
            switch (this.$(e).text()) {
                case 'ICQ:':
                    this.icq = dd.children('a').attr('href')
                                .replace(/http\:\/\/www\.icq\.com\/people\//, '')
                                .replace(/\//, '');
                    break;
                case 'WWW:':
                    this.www = dd.children('a').attr('href'); break;
                case 'Jabber:':
                    this.jabber = dd.text(); break;
            }
        });
        userBodyPanel2.children('div.column2').children('dl.details').children('dt').each((i, e) => {
            let dd = this.$(e).next();
            switch (this.$(e).text()) {
                case 'Registrován:':
                    this.registered = this.parseDate(dd.text()); break;
                case 'Poslední návštěva:':
                    this.lastVisit = (dd.text() == ' - ') ? null : this.parseDate(dd.text()); break;
                case 'Celkem příspěvků:':
                    this.totalPosts = +dd.text().split(/\n/).shift().replace(/ .*$/m, ''); break;
            }
        });
        this.likesGave = +userBody.first().next().next().next().next()
            .children('div.inner').children('dl').children('dt').text()
            .replace(/Dal poděkování: /, '')
            .replace(/ krát/, '');
        this.likesGot  = +userBody.first().next().next().next().next().next()
            .children('div.inner').children('dl').children('dt').text()
            .replace(/Dostal poděkování: /, '')
            .replace(/ krát/, '');
    }

    private scrapGroup(): void {
        fnDebug('scrapGroup()');
        this.phpbbid = this.groupIdFromUrl(this.url);
        this.title = this.$('h2').text();
        this.$('tbody').children('tr').each((i, e) => {
            let td = this.$(e).children('td').first();
            this.users.push(td.children('a').attr('href'));
        });
    }

    private scrapPagination(): void {
        fnDebug('scrapPagination()');
        let pagination = this.$('.pagination').children('a').children('strong');
        this.page = +pagination.first().text();
        if (this.page > 0) {
            this.firstPageUrl = this.url;
            switch (this.type) {
                case PageType.Forum:
                    this.firstPageUrl = this.url.replace(/\/page\d+\.html$/, '/');
                    break;
                case PageType.Group:
                case PageType.Thread:
                    this.firstPageUrl = this.url.replace(/\-\d+\.html$/, '.html');
                    break;
            }
        }
    }

    private scrapThread(): void {
        fnDebug('scrapThread()');
        this.phpbbid = this.threadIdFromUrl(this.url);
        this.title = this.$('div#page-body').children("h2").text();
        this.$('.post').each((i, p) => {
            let postBody = this.$(p).children('div.inner').children('div.postbody');
            let titleLink = postBody.children('h3').children('a');
            let authorBody = postBody.children('p.author');
            if (authorBody.length > 0) {
                let authorLink = authorBody.children('strong').children('a');
                let likesBody = postBody.children('div.content').last().children('dl.postbody').children('dd').children('a');
                let likes = [];
                likesBody.each((j, a) => {
                    likes.push(this.$(a).attr('href'));
                });
                let created = this.convertCreatedDate(authorBody);
                let authorUrl = authorLink.attr('href');
                let authorName = authorLink.text();
                if (!authorUrl) {
                    authorName = authorBody.children('strong').children('span').text();
                    authorUrl = 'http://unregistered.user/'+this.normalizeString(authorName);
                }
                let post = {
                    phpbbid: this.postId(this.$(p).attr('id')),
                    url: titleLink.attr('href'),
                    title: titleLink.text(),
                    authorUrl: authorUrl,
                    authorName: authorName,
                    created: created,
                    content: postBody.children('div.content').first().html(),
                    likes: likes
                }
                if (post.phpbbid) {
                    this.posts.push(post);
                }
            }
        });
    }

    private normalizeString(s: string): string {
        return removeDiacritics(s.toLowerCase().replace(/\@/g, ''))
                .replace(/\s/g, '-').replace(/\-+/g, '-');
    }

    private makeGroupUrl(id, name): string {
        if (id == 2) { name = 'registered'; }
        let url = URL.parse(this.url);
        return url.protocol+'//'+
                url.host+'/'+this.normalizeString(name)+
                '-g'+id+'.html';
    }

    private forumIdFromUrl(url): number {
        const re = /\-f(\d+)\/(page\d+\.html)?$/;
        let matches = re.exec(url);
        if (matches && matches[1]) {
            return +matches[1];
        }
        return null;
    }

    private threadIdFromUrl(url): number {
        const re = /\-t(\d+)(\-\d+)?\.html$/;
        let matches = re.exec(url);
        if (matches && matches[1]) {
            return +matches[1];
        }
        return null;
    }

    private userIdFromUrl(url): number {
        const re = /\-u(\d+)\/$/;
        let matches = re.exec(url);
        if (matches && matches[1]) {
            return +matches[1];
        }
        return null;
    }

    private groupIdFromUrl(url): number {
        const re = /\-g(\d+)(\-\d+)?\.html$/;
        let matches = re.exec(url);
        if (matches && matches[1]) {
            return +matches[1];
        }
        return null;
    }

    private postId(hash): number {
        let id = hash;
        if (id) {
            id = ''+id;
            if (id.length > 0) {
                return +id.replace(/^p/, '');
            }
        }
        return null;
    }

    private month(m): string {
        return {
            led: '01',
            úno: '02',
            bře: '03',
            dub: '04',
            kvě: '05',
            čer: '06',
            črc: '07',
            srp: '08',
            zář: '09',
            říj: '10',
            lis: '11',
            pro: '12'
        }[m];
    }

    private parseDate(date): string {
        let c = date.split(/ /);
        if (c.length > 1) {
            return c[2].replace(',','')+'-'+this.month(c[1])+'-'+c[0]+' '+c[3];
        }
        return null;
    }

    private convertCreatedDate(authorBody): string {
        let createdBody = authorBody.clone();
        createdBody.children().each((i, e) => { this.$(e).remove(); });
        return this.parseDate(createdBody.text().replace(/od  » /, ''));
    }

}
