# forum.pirati.cz scrapper to RDF

This node.js app scraps forum.pirati.cz phpbb forum and converts its data to RDF in turtle files (`text/turtle`).

Rename config.example.json to config.json and update your username and password.
Change other values like scrapping rate interval or caching options if necessary.

Run with `node ./dist/index.js`.

Quit with `^C` (state and RDFs will be saved).
App loads its state when run again.

TODO:
* address data requires parsing and validation
* find properties for user's: signature, rank, occupation, defaultGroup, interests, profession, totalPosts, likesGot, likesGave, showOnMap

