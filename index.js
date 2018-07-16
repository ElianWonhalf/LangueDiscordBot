const Discord = require('discord.js');
const DeeplTranslator = require('deepl-translator');
const Dictionary = require('./word-definition/index');
const Gender = require('gender-fr');
const Wiki = require('wikijs');
const Logger = require('@elian-wonhalf/pretty-logger');

const config = require('./config.json');
const bot = new Discord.Client();

const definition = 'def';
const synonym = 'synonymebeta';
const etymology = 'ety';

bot.on('ready', function () {
    Logger.notice('Connected!');
});

bot.on('message', function (message) {
    if (message.content.startsWith(config.prefix) && message.content.length > config.prefix.length) {
        let messageArray = message.content.substr(config.prefix.length).split(' ');
        let command = messageArray.shift();
        let arguments = messageArray.join(' ');

        handleCommand(message, command, arguments, message.author.id === config.owner);
    }
});

function handleCommand(message, command, arguments, debug) {
    let regTranslate = /^[a-z]{2}-[a-z]{2}$/;
    let regWord = /^[A-Za-z\u00E0-\u00FC]+$/;

    if (debug) {
        Logger.info('Received a command "' + command + '"');
    }

    if (regTranslate.test(command) && arguments.length > 2) {
        deepl(message, command, debug);
    }

    if (command === definition) {
        wikitionaryDefinition(message, arguments, debug)
    }

    if ((command === etymology || command === synonym) && regWord.test(arguments)) {
        wikitionaryEtymology(message, command, arguments, debug);
    }
}

function deepl(message, command, debug) {
    let from = command.split('-')[0];
    let to = command.split('-')[1];

    if (debug) {
        Logger.info('DEEPL: Translating from ' + from + ' to ' + to + '...');
    }

    DeeplTranslator.translate(arguments, to.toUpperCase(), from.toUpperCase()).then(res => {
        let translation = '_' + arguments + '_ => ' + '_' + res.translation + '_';
        message.channel.send(translation).catch(Logger.error);
    }).catch(Logger.error);
}

function wikitionaryDefinition(message, arguments, debug) {
    let lang = message.channel.name === 'anglais' ? 'en' : 'fr';

    if (debug) {
        Logger.info('DEFINITION: Fetching the definition of ' + arguments + ' for language ' + lang + '...');
    }

    Dictionary.getDef(arguments, lang, {exact: false, debug: debug}, (def) => {
        let genderOfNoun = '';
        let res = '';

        if (lang === 'fr' && def.category === 'nom') {
            if (debug) {
                Logger.info('DEFINITION: In callback "if"');
            }

            Gender.gendersForNoun(def.word, (e, g) => {
                Gender.addDefiniteArticle(def.word, (er, definite) => {
                    Gender.addIndefiniteArticle(def.word, (err, indefinite) => {
                        if (g[0] === 'f') {
                            genderOfNoun = ' féminin';
                        } else if (g[0] === 'm') {
                            genderOfNoun = ' masculin';
                        }

                        genderOfNoun += ' (' + definite + '; ' + indefinite + ')';
                        res = '__' + def.word + '__, ' + def.category + genderOfNoun + ' : \r  `' + def.definition + '`';

                        if (!def.err) {
                            message.channel.send(res).catch(Logger.error);
                        } else {
                            message.channel.send(handleWikitionaryError(def.err, lang)).catch(Logger.error);
                        }
                    })
                })
            });
        } else {
            if (debug) {
                Logger.info('DEFINITION: In callback "else"');
            }

            res = '__' + def.word + '__, ' + def.category + ' : \r  `' + def.definition + '`';

            if (!def.err) {
                message.channel.send(res).catch(Logger.error);
            } else {
                message.channel.send(handleWikitionaryError(def.err, lang)).catch(Logger.error);
            }
        }
    });
}

function wikitionaryEtymology(message, command, arguments, debug) {
    let title;
    let lang = message.channel.name === 'anglais' ? 'en' : 'fr';

    if (debug) {
        Logger.info('ETYMOLOGY: Fetching an etymology for language ' + lang + '...');
    }

    if (command === synonym) {
        title = message.channel.name === 'anglais' ? 'Synonyms' : 'Synonymes';
    } else if (command === etymology) {
        title = message.channel.name === 'anglais' ? 'Etymology' : 'Étymologie';
    } else {
        title = message.channel.name === '';
    }

    if (debug) {
        Logger.info('ETYMOLOGY: title is ' + title);
    }

    Wiki.default({
        apiUrl: 'https://' + lang + '.wiktionary.org/w/api.php',
        origin: null
    }).search(arguments).then((s) => {
        Wiki.default({
            apiUrl: 'https://' + lang + '.wiktionary.org/w/api.php',
            origin: null
        }).page(s.results[0]).then((p) => {
            p.content().then((c) => {
                let etymology = capTextByTitle(c, title, command).trim();

                if (etymology.length > 5) {
                    etymology = '(' + title.toLowerCase() + ') __' + p.raw.title + '__ : \r `' + etymology + '`';
                    message.channel.send(etymology).catch(Logger.error);
                }
            });
        });
    });
}

function handleWikitionaryError(error, lang) {
    let answer = null;

    switch (error) {
        case 'not found':
            if (lang === 'fr') {
                answer = 'Désolé, je n\'ai pas trouvé de définition :( !';
            } else {
                answer = 'Sorry, I wasn\'t able to find a definition :( !';
            }
            break;

        case 'invalid characters':
            if (lang === 'fr') {
                answer = 'Il y a des caractères que Wikitionnaire ne gère pas dans ton mot';
            } else {
                answer = 'There are characters Wikitionary does not understand in your word';
            }
            break;

        default:
            Logger.error(error);

            if (lang === 'fr') {
                answer = 'Une erreur inconnue est survenue, <@' + config.owner + '> tu peux regarder ce que c\'est ?';
            } else {
                answer = 'An unknown error occured,  <@' + config.owner + '> can you take a look?';
            }
            break;
    }

    return answer;
}

function capTextByTitle(ctt, title, cmd) {
    let ret = '';

    if (title !== '') {
        ret = ctt.substr(ctt.indexOf(title));
        ret = ret.split(/(===)\s.+\s(===)|(====)\s.+\s(====)/)[0];
        ret = ret.split(/\([0-9]+\)/).join('');

        if (cmd === etymology) {
            ret = ret.replace(title + ' ===', '');
        } else if (cmd === synonym) {
            ret = ret.replace(title + ' ====', '');
            ret = ret.split(/\s+/).join(', ').trim()
        }

        if (/,/.test(ret[ret.length - 1])) {
            ret = ret.substr(0, ret.length - 1);
        }

        if (/,/.test(ret[0])) {
            ret = ret.replace(',', '');
        }
    }

    return ret
}

bot.login(config.token).catch(Logger.error);
