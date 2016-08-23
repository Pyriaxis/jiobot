
var Promise = require('bluebird');
var monk = require('monk');

const moment = require('moment');
const _ = require('lodash');

const bottoken = require('./config/config.js');
const TeleBot = require('telebot');

const bot = new TeleBot({
    token: bottoken.config.apiKey, // Required. Telegram Bot API token.
    pooling: { // Optional. Use pooling.
        interval: 1000, // Optional. How often check updates (in ms).
        timeout: 0, // Optional. Update pulling timeout (0 - short polling).
        limit: 100, // Optional. Limits the number of updates to be retrieved.
        retryTimeout: 5000 // Optional. Reconnecting timeout (in ms).
    }
});

bot.use(require('./node_modules/telebot/modules/ask.js'));

const lazyDB = {}; // i'm lazy to set up mongo

bot.on(['/start', '/help'], msg => {
    return bot.sendMessage(msg.from.id, 'Hi there!')
});

bot.on('/new', msg => {
    if (msg.chat.type === 'private'){
        //reject
        return bot.sendMessage(msg.from.id, 'Please create the Jio in a group chat.');
    } else {
        console.log(msg.chat.id);
        return bot.sendMessage(msg.chat.id, 'What is the name of the meetup?', {ask: 'meetupTitle' });
    };
});

//Bot waiting for meetupTitle
bot.on('ask.meetupTitle', msg => {
    //replace with DB later ... initializing array
    if (lazyDB[msg.chat.id] === undefined){
        lazyDB[msg.chat.id] = [];
    }
    lazyDB[msg.chat.id].push({
        creator: msg.from.id,
        title: msg.text,
        active: true
    });

    return bot.sendMessage(msg.chat.id, 'What options do you want?', {ask: 'meetupOptions'});
});

bot.on('/end', msg => {
})

bot.on('ask.meetupOptions', msg => {
    var jioObject = _.find(lazyDB[msg.chat.id], {'creator': msg.from.id, 'active': true });
    if (jioObject.options === undefined){
        jioObject.options = [];
    }

    if (msg.text === 'finished jioing') {
        return bot.sendMessage(msg.chat.id, 'Jio for ' + jioObject.title + ' with the following options ' + jioObject.options);
    }

    jioObject.options.push(msg.text);
    let markup = bot.keyboard([
        ['finished jioing']
    ],{resize: true});

    return bot.sendMessage(msg.chat.id, 'Ok, option added. Please continue adding options or press the done button.', {markup, ask: 'meetupOptions'});
})

bot.on(['/check'], msg => {

});

bot.on('/debug', msg => {
    console.log(lazyDB);
});


bot.connect();
