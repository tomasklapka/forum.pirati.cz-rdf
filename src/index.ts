export const PKGNAME = 'forum.pirati.cz-rdf';
import { getDebug } from './debug'
let debug = getDebug('index');

import * as process from 'process';
import * as fs from 'fs';

import { PhpbbPageType as PageType } from './phpbb-page-scrapper';
import { ForumPiratiCzPageScrapper } from './forum-pirati-cz-page-scrapper';
import { FileSystemGraphStore } from './file-system-graph-store';
import { RdfExport } from './rdf-export';

const configFile = './config.json';

let forumUrl = 'https://forum.pirati.cz/';
let username = null;
let password = null;
let outDir = './out/';
let dataFile = outDir+'queue.json';
let requestCache = false;

let queue = [];
let finished = [];

loadConfig();

const graphStore = new FileSystemGraphStore(forumUrl, outDir);
const rdfExport = new RdfExport(forumUrl, graphStore);

loadData();

process.on('SIGINT', quit);

ForumPiratiCzPageScrapper
.login(forumUrl+'ucp.php?mode=login', username, password)
.then((response) => {
    setInterval(scrapTick, 1000);
    setInterval(saveData, 60000);
})
.catch((err) => {
    console.log(err);
});

function scrapTick(): void {
    if (queue.length > 0) {
        const url = queue.shift();
        (new ForumPiratiCzPageScrapper(url, requestCache)).scrap().then((data) => {
            if (data.links) {
                for (const link of data.links) {
                    switch (link.type) { // crawl forum links
                        case PageType.Forum:
                        case PageType.Thread:
                        case PageType.Group:
                        case PageType.User:
                            if (finished.indexOf(link.url) == -1 &&
                                queue.indexOf(link.url) == -1) {
                                queue.push(link.url);
                            }
                    }
                }
            }
            rdfExport.add(data);
            finished.push(url);
        });
    }
}

function stats(): void {
    console.log((new Date())+'\tqueue: '+queue.length+'\tfinished: '+finished.length);
}

function quit(): void {
    console.log('Exitting...');
    ForumPiratiCzPageScrapper.quit();
    saveData();
    console.log('Finished ok');
    process.exit();
}

function saveData(): void {
    fs.writeFileSync(dataFile, JSON.stringify({
        queue: queue,
        finished: finished
    }, null, ' '));
    stats();
}

function loadData(): void {
    if (fs.existsSync(dataFile)) {
        let data = JSON.parse(fs.readFileSync(dataFile).toString());
        if (data) {
            queue = data.queue;
            finished = data.finished;
        }
    }
    if (queue.length == 0) {
        queue.push(forumUrl);
    }
    stats();
}

function loadConfig(): void {
    if (fs.existsSync(configFile)) {
        let data = JSON.parse(fs.readFileSync(configFile).toString());
        if (data) {
            if (data.forumUrl)      forumUrl        = data.forumUrl;
            if (data.username)      username        = data.username;
            if (data.password)      password        = data.password;
            if (data.requestCache)  requestCache    = data.requestCache;
            if (data.outDir) {
                outDir = data.outDir;
                dataFile = outDir+'queue.json';
            }
        }
    }
}
