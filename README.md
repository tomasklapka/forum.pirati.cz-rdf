# forum.pirati.cz scrapper to RDF

This node.js app scraps forum.pirati.cz phpbb forum and converts its data to RDF in turtle files (`text/turtle`).

Rename config.example.json to config.json and update your username and password.

Run with `node ./dist/index.js`.

Scrapping rate is one page per second.
State and RDFs are saved to outDir once per minute.

Quit with `^C` (state and RDFs will be saved).

App loads its state and RDFs when run again.

HTTP requests are cached in Redis. 