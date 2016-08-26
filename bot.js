
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
const jioMapping = db.get('jioMapping');

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
        creating[msg.from.id] = 'init'; //set local flag to true to prevent shenanigans.
        return bot.sendMessage(msg.chat.id, 'What is the title/description of the Jio?', {ask: 'meetupTitle' });
    };
});

//Bot waiting for meetupTitle
bot.on('ask.meetupTitle', msg => {
    //replace with DB later ... initializing array
    jioDB.insert({
        creatorId: msg.from.id,
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

        let inlineArray = [];

        return jioDB.findOne({_id: creating[msg.from.id]}).then(doc => {
            for (let i = 0; i < doc.options.length; i++){
                inlineArray.push([bot.inlineButton(doc.options[i], {callback: doc.options[i]}) ]);
            }
            console.log(doc._id);

            inlineArray.push([bot.inlineButton('Share Jio', {inline: doc._id}), bot.inlineButton('Cancel Jio', {callback: 'cancel'})]);

            console.log(inlineArray);


            delete(creating[msg.from.id]);

            let markup = bot.inlineKeyboard(inlineArray);
            return bot.sendMessage(msg.chat.id, 'Jio for ' + doc.title + ' created by ' + doc.creator + '!\n' +
                'Please verify the options below:', { markup });
        })

    }

    jioDB.findOne({_id: creating[msg.from.id]}, 'options').then(doc =>{
        var newOptions = doc.options;
        newOptions.push(msg.text);
        jioDB.update({_id: creating[msg.from.id]}, {$set:{options: newOptions}});
    }).catch( err =>{
        console.log('meetup Options error');
    }).then(()=> {db.close()});

    let markup = bot.keyboard([
        ['/finishJio']
    ],{resize: true, once: true});

    return bot.sendMessage(msg.chat.id, 'Ok, option added. Please continue adding options or press the done button.', {markup, ask: 'meetupOptions'});
});

bot.on('inlineQuery', msg => {
    console.log(msg);
    let answers = bot.answerList(msg.id, {cacheTime: 5});
    var query = msg.query;
    jioDB.findOne({_id: monk.id(query)}).then(doc => {
        console.log(doc);

        let optionArray = []
        for (let i = 0; i < doc.options.length; i++){
            optionArray.push([ bot.inlineButton(doc.options[i], {callback: JSON.stringify({ id: doc._id ,option: doc.options[i]}) })]);

        }

        var jioOptionKeyboard = bot.inlineKeyboard(optionArray);

        answers.addArticle({
            reply_markup: jioOptionKeyboard,
            id: doc._id,
            title: doc.title,
            description: 'Press to share jio with friends!',
            message_text: "Hi, this Jio is for " + doc.title + ".\nVote for the options below:"
        });

        return bot.answerQuery(answers);

    }).catch(err => {
        console.log(err);
    });
});

bot.on('callbackQuery', msg =>{
    console.log(msg);
    var json = JSON.parse(msg.data);
    console.log(json);
});


bot.connect();
