const Discord = require('discord.js');
const translate = require('google-translate-api');
const Dictionary = require('./word-definition/index');
const Gender = require('gender-fr');
const Logger = require('@elian-wonhalf/pretty-logger');

const config = require('./config.json');
const bot = new Discord.Client();


const definition = 'def';
const frenchWarning = 'Cette réponse automatique peut être fausse, n\'hésite pas à demander à un natif.';
const englishWarning = 'This automatic answer might be wrong, feel free to ask a native.';

process.on('uncaughtException', (exception) => {
    if (typeof bot === 'undefined') {
        Logger.error('Crashed at an unknown position. This is weird. This shouldn\'t happen. SEND HALP!');
        Logger.error('----');
        Logger.exception(exception);
        Logger.error('----');
    } else {
        Logger.error('I crashed. I CRASHED D: !');
        Logger.error('----');
        Logger.exception(exception);
        Logger.error('----');

        bot.destroy().then(() => {
            bot.login(config.token).catch(Logger.exception);
        }).catch(Logger.exception);
    }
});

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

    if (debug) {
        Logger.info('Received a command "' + command + '"');
    }

    if (regTranslate.test(command) && arguments.length > 2) {
        deepl(message, command, arguments, debug);
    }

    if (command === definition) {
        wikitionaryDefinition(message, arguments, debug)
    }
}

function deepl(message, command, arguments, debug) {
    let from = command.split('-')[0];
    let to = command.split('-')[1];

    if (debug) {
        Logger.info('DEEPL: Translating from ' + from + ' to ' + to + '...');
    }

    translate(arguments, {from: from.toLowerCase(), to: to.toLowerCase()}).then(res => {
        let translation = '_' + arguments + '_ => ' + '_' + res.text + '_';
        sendMessage(message, translation);
    }).catch(Logger.exception);
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
                            sendMessage(message, res);
                        } else {
                            sendMessage(message, handleWikitionaryError(def.err, lang));
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
                sendMessage(message, res);
            } else {
                sendMessage(message, handleWikitionaryError(def.err, lang));
            }
        }
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
            Logger.exception(error);

            if (lang === 'fr') {
                answer = 'Une erreur inconnue est survenue, <@' + config.owner + '> tu peux regarder ce que c\'est ?';
            } else {
                answer = 'An unknown error occured,  <@' + config.owner + '> can you take a look?';
            }
            break;
    }

    return answer;
}

function sendMessage(message, answer) {
    let warning = isAuthorNative(message) ? '**' + frenchWarning + '**\n' : '**' + englishWarning + '**\n';

    return message.channel.send(warning + answer).catch(Logger.exception);
}

function isAuthorNative(message) {
    let native = false;

    if (message.guild !== null) {
        native = message.guild.member(message.author).roles.exists('name', 'Francophone Natif');
    }

    return native;
}

bot.login(config.token).catch(Logger.exception);
