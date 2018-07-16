const https = require("https");
const Logger = require('@elian-wonhalf/pretty-logger');

const titlesURL = ".wiktionary.org/w/api.php?action=query&list=search&format=json&utf8&srprop=&srsearch=";
const pagesURL = ".wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&format=json&titles=";

const parser = function (word, lng, options, callback) {
    this.word = word;
    this.lng = lng;
    this.options = options || {};
    this.callback = callback;
    this.srwhat = "nearmatch";
    this.lastTitle = "";
};

const errors = {
    notFound: "not found",
    req: "a request has failed"
};

parser.prototype.sendErr = function (err, word) {
    this.callback({word: word || this.word, err: err});
};

parser.prototype.getTitles = function () {
    const calledURL = "https://" + this.lng + titlesURL + encodeURIComponent(this.word) + "&srwhat=" + this.srwhat;

    if (this.options.debug) {
        Logger.info('PARSER: Get titles for "' + encodeURIComponent(this.word) + '": ' + calledURL);
    }

    const req = https.get(calledURL, function (result) {
        let cont = "";

        result.on("data", function (chunk) {
            cont += chunk;
        }).on("end", function () {
            let articles = null;

            if (this.options.debug) {
                Logger.info('PARSER: Get titles for "' + encodeURIComponent(this.word) + '" ended, about to JSON parse...');
            }

            try {
                articles = JSON.parse(cont).query.search;
            } catch (err) {
                return this.sendErr(errors.req);
            }

            if (this.options.debug) {
                Logger.info('PARSER: Get titles for "' + encodeURIComponent(this.word) + '" JSON parsed, ' + articles.length + ' articles.');
            }

            if (articles.length) {
                const exclude = this.titles ? this.titles[0] : "";
                this.titles = [];

                articles.forEach(function (article) {
                    const title = article.title;

                    if (title !== exclude) {
                        this.titles.push(title);
                    }
                }, this);

                if (this.options.debug) {
                    Logger.info('PARSER: Get titles for "' + encodeURIComponent(this.word) + '" JSON parsed, ' + this.titles.length + ' titles.');
                }

                if (this.titles.length) {
                    this.getPage();
                } else {
                    this.sendErr(errors.notFound);
                }
            } else {
                if (this.srwhat === "nearmatch") {
                    this.srwhat = "text";
                    this.getTitles();
                } else {
                    this.sendErr(errors.notFound);
                }
            }
        }.bind(this));
    }.bind(this));

    req.on("error", function () {
        this.sendErr(errors.req);
    }.bind(this));
};

parser.prototype.getPage = function () {
    const calledURL = "https://" + this.lng + pagesURL + encodeURIComponent(this.titles[0]);

    if (this.options.debug) {
        Logger.info('PARSER: Get titles for "' + encodeURIComponent(this.word) + '": ' + calledURL);
    }

    const req = https.get(calledURL, function (result) {
        let cont = "";

        result.on("data", function (chunk) {
            cont += chunk;
        }).on("end", function () {
            let pages;

            if (this.options.debug) {
                Logger.info('PARSER: Get page for "' + encodeURIComponent(this.titles[0]) + '" ended, about to JSON parse...');
            }

            try {
                pages = JSON.parse(cont).query.pages;
            } catch (err) {
                return this.sendErr(errors.req);
            }

            if (this.options.debug) {
                Logger.info('PARSER: Get page for "' + encodeURIComponent(this.titles[0]) + '" JSON parsed');
            }

            if (!pages) {
                return this.sendErr("getPage - page = null - cont = " + cont);
            }

            if (pages[-1]) {
                if (this.options.debug) {
                    Logger.info('PARSER: Get page for "' + encodeURIComponent(this.titles[0]) + '", pages[-1] true.');
                }

                if (this.lastTitle) {
                    this.cleanup(this.lastTitle, this.cat.toLowerCase(), this.titles[0]);
                } else {
                    this.sendErr(errors.notFound);
                }
            } else {
                if (this.options.debug) {
                    Logger.info('PARSER: Get page for "' + encodeURIComponent(this.titles[0]) + '", about to parse page...');
                }

                this.parse(pages[Object.keys(pages)[0]].revisions[0]["*"]);
            }
        }.bind(this));
    }.bind(this));

    req.on("error", function () {
        this.sendErr(errors.req);
    }.bind(this));
};

parser.prototype.parse = function (page) {
    const autoRedirect = /^#REDIRECT[^[]*\[\[([^\]]+)\]\]\s*$/i.exec(page);

    if (autoRedirect) {
        if (this.options.debug) {
            Logger.info('PARSER: Parsing page, found automatic redirect.');
        }

        this.titles[0] = autoRedirect[1];
        return this.getPage();
    }

    const def = this.searchDef(page);

    if (def === true) {
        if (this.options.debug) {
            Logger.info('PARSER: Parsing page, def == true.');
        }

        return;
    }

    if (def) {
        if (this.options.debug) {
            Logger.info('PARSER: Parsing page, if (def).');
        }

        for (let i = 0, len = this.variants.length; i < len; i++) {
            let found = this.variants[i].exec(def);

            if (found) {
                this.lastTitle = this.titles[0];
                this.titles[0] = found[found.length - 1];
                this.getPage();

                return;
            }
        }

        this.cleanup(this.titles[0], this.cat.toLowerCase(), def);
    } else {
        if (this.options.debug) {
            Logger.info('PARSER: Parsing page, !def.');
        }

        delete this.cat;

        if (this.srwhat === "nearmatch") {
            this.srwhat = "text";
            this.getTitles();
        } else {
            this.titles.shift();
            if (this.titles.length) {
                this.getPage();
            } else {
                this.sendErr(errors.notFound);
            }
        }
    }
};

parser.prototype.cleanup = function (word, cat, def) {
    def = def.replace(new RegExp("{{(([^}|]+)\\|)+" + this.lng + "}}", "g"), "($2)");
    def = def.replace(/{{[^}]*}}/g, "");
    def = def.replace(/<(\w+)>[^<]*<\/\1>/, "").trim();

    if (/^\s*\.*$/.test(def)) {
        return this.sendErr(errors.notFound, word);
    }

    def = def.replace(/'''([^']+)'''/g, "$1");
    def = def.replace(/''([^']+)''/g, "$1");

    switch (this.options.hyperlinks) {
        case "brackets":
            break;

        case "html":
            let url = "https://" + this.lng + ".wiktionary.org/wiki/";
            def = def.replace(/\[\[([^\]|]+)(\|)([^\]]+)\]\]/g, "<a href='" + url + "$1' target='_blank'>$3</a>");
            def = def.replace(/\[\[([^\]]+)\]\]/g, "<a href='" + url + "$1' target='_blank'>$1</a>");
            break;

        case "none":
        default:
            def = def.replace(/\[\[([^\]|]+\|)*([^\]]+)\]\]/g, "$2");
    }

    this.callback({"word": word, "category": cat.replace(/\|.*/, ""), "definition": def.trim()});
};

module.exports.parser = parser;
