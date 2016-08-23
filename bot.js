
var Promise = require('bluebird');
var monk = require('monk');

const moment = require('moment');
const _ = require('lodash');

const bottoken = require('./config/config.js');
const TeleBot = require('telebot');

const url = 'localhost:27017/jiobot'; //change in production
const db = monk(url);

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

const creating = {};
const jioDB = db.get('jioData');

bot.on(['/start', '/help'], msg => {
    return bot.sendMessage(msg.from.id, 'Hi there!')
});

bot.on('/new', msg => {
    if (msg.chat.type !== 'private'){
        //reject
        return bot.sendMessage(msg.chat.id, 'Please create the Jio privately, then share it to a group chat.');
    } else if (creating[msg.from.id] !== undefined){
        return bot.sendMessage(msg.from.id, 'You are already in process of creating a Jio. Please finish or cancel that Jio first.')
    } else {
        creating[msg.from.id] = 'init'; //set local flag to true to prevent shenenigans.
        return bot.sendMessage(msg.chat.id, 'What is the title/description of the Jio?', {ask: 'meetupTitle' });
    };
});

//Bot waiting for meetupTitle
bot.on('ask.meetupTitle', msg => {
    //replace with DB later ... initializing array
    jioDB.insert({
        creator: msg.from.first_name + ' ' + (msg.from.last_name || ''),
        title: msg.text,
        active: true,
        options: []
    }).then(doc => {
        creating[msg.from.id] = doc._id;
    }).catch(err => {
        //handle error
    }).then(()=>{
        db.close()
    });

    return bot.sendMessage(msg.from.id, 'Now send me a list of options to add, one by one.', {ask: 'meetupOptions'});
});


bot.on('ask.meetupOptions', msg => {

    if (msg.text === '/finishJio') {

        delete(creating[msg.from.id]);
        let inlineArray = [];

        return jioDB.findOne({_id: creating[msg.from.id]}).then(doc => {
            for (let i = 0; i < doc.options.length; i++){
                inlineArray.push([bot.inlineButton(doc.options[i], {callback: doc.options[i]}) ]);
            }
            inlineArray.push([bot.inlineButton('Share Jio', {callback: 'share'}), bot.inlineButton('Cancel Jio', {callback: 'cancel'})]);

            console.log(inlineArray);

            let markup = bot.inlineKeyboard(inlineArray);

            return bot.sendMessage(msg.chat.id, 'Jio for ' + doc.title + ' created by ' + doc.creator + '!\n' +
                'Please verify the options below:', { markup });
        })

    }

    jioDB.findOne({_id: creating[msg.from.id]}, 'options').then(doc =>{
        var newOptions = doc.options;
        newOptions.push(msg.text);
        jioDB.update({_id: creating[msg.from.id]}, {options: newOptions});
    }).catch( err =>{
        console.log('meetup Options error');
    }).then(()=> {db.close()});

    let markup = bot.keyboard([
        ['/finishJio']
    ],{resize: true, once: true});

    return bot.sendMessage(msg.chat.id, 'Ok, option added. Please continue adding options or press the done button.', {markup, ask: 'meetupOptions'});
})

bot.on(['/check'], msg => {

});

bot.on('*', msg => {
    console.log('--------------------------');
    console.log(msg);
    console.log(lazyDB);
    console.log('--------------------------');
});


bot.connect();
