export const PKGNAME = 'forum.pirati.cz-rdf';
import { getDebug } from './debug'
let debug = getDebug('index');

import * as process from 'process';
import * as fs from 'fs';

import { PhpbbPageType as PageType } from './phpbb-page-scrapper';
import { ForumPiratiCzPageScrapper } from './forum-pirati-cz-page-scrapper';
import { RdfExport } from './rdf-export';

const configFile = './config.json';

let forumUrl = 'https://forum.pirati.cz/';
let username = null;
let password = null;
let outDir = './out/';
let dataFile = outDir+'queue.json';

let queue = [];
let finished = [];

loadConfig();

const rdfExport = new RdfExport(forumUrl);
rdfExport.setOutDir(outDir);
loadData();
process.on('SIGINT', quit);

ForumPiratiCzPageScrapper
.login(forumUrl+'ucp.php?mode=login', username, password)
.then((response) => {
    setInterval(scrapTick, 1000);
    setInterval(saveData, 60000);
})
.catch((err) => { debug(err); });

function scrapTick(): void {
    if (queue.length > 0) {
        let url = queue.shift();
        (new ForumPiratiCzPageScrapper(url)).scrap().then((data) => {
            if (data.links) {
                for (let link of data.links) {
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
    console.log((new Date()).toISOString());
    console.log(rdfExport.stats());
    console.log('\tqueue:\t\t'+queue.length);
    console.log('\tfinished:\t'+finished.length);
}

function quit(): void {
    console.log('Exitting...');
    rdfExport.save();
    ForumPiratiCzPageScrapper.quit();
    saveData();
    console.log('Finished ok');
    process.exit();
}

function saveData(): void {
    rdfExport.save();
    fs.writeFileSync(dataFile, JSON.stringify({
        queue: queue,
        finished: finished
    }, null, ' '));
    stats();
}

function loadConfig(): void {
    if (fs.existsSync(configFile)) {
        let data = JSON.parse(fs.readFileSync(configFile).toString());
        if (data) {
            if (data.forumUrl) forumUrl = data.forumUrl;
            if (data.username) username = data.username;
            if (data.password) password = data.password;
            if (data.outDir) {
                outDir = data.outDir;
                dataFile = outDir+'queue.json';
            }
        }
    }
}

function loadData(): void {
    rdfExport.load(outDir);
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
