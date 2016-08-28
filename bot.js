
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
const jioMembers = db.get('jioMembers');

bot.on(['/start', '/help'], msg => {
    return bot.sendMessage(msg.from.id, 'Hi there!')
});

bot.on('/register', msg => {

    if (msg.chat.type !== 'private') {
        return bot.sendMessage(msg.chat.id, 'Please /register with me in private before creating Jios.');
    } else {
        jioMembers.findOne({telegramId: msg.from.id}).then(doc => {
            if (doc !== null){
                return bot.sendMessage(msg.from.id, 'You have already registered with the jioBot.');
            }  else {
                jioMembers.insert({
                    telegramId: msg.from.id
                }).then( newDoc => {
                    return bot.sendMessage(msg.from.id, 'You have successfully registered with the jioBot.');
                });
            }
        });
    }
});

bot.on('/new', msg => {

    jioMembers.findOne({telegramId: msg.from.id}).then(doc =>{
        if (doc !== null){
            if (creating[msg.from.id] !== undefined){
                return bot.sendMessage(msg.from.id, 'You are already in process of creating a Jio. Please finish or cancel that Jio first.')
            } else {

                jioDB.insert({
                    creatorId: msg.from.id,
                    groupId: msg.chat.id,
                    creator: msg.from.first_name + ' ' + (msg.from.last_name || ''),
                    title: null,
                    active: true,
                    options: []
                }).then(newDoc => {
                    creating[msg.from.id] = newDoc._id; //set local flag to true to prevent shenanigans.
                    return bot.sendMessage(msg.chat.id, 'What is the title/description of the Jio?', {ask: 'meetupTitle' });
                });
            };
        } else {
            return bot.sendMessage(msg.chat.id, 'Please /register with me in private before creating Jios.');
        }
    });
});

//Bot waiting for meetupTitle
bot.on('ask.meetupTitle', msg => {
    //replace with DB later ... initializing array
    return jioDB.findOne({creatorId: msg.from.id}).then(doc => {
        if (doc){
            return jioDB.update({_id: monk.id(doc._id)}, {$set: {title: msg.text}}).then(updDoc => {
                return bot.sendMessage(msg.from.id, 'Now send me a list of options to add, one by one.', {ask: 'meetupOptions'});
            });
        } else {
            return bot.sendMessage(msg.chat.id, 'You are not the creator of the jio, please hold on.', {ask: 'meetupTitle'});
        };
    })
});

bot.on('ask.meetupOptions', msg => {

    if (msg.text === '/finishJio') {

        let inlineArray = [];

        //group workflow
        return jioDB.findOne({_id: creating[msg.from.id]}).then(doc => {
            for (let i = 0; i < doc.options.length; i++){
                inlineArray.push([bot.inlineButton(doc.options[i].optionName, {callback: JSON.stringify({ id: doc._id ,optionName: doc.options[i].optionName}) }) ]);
            }

            //inlineArray.push([bot.inlineButton('Share Jio', {inline: doc._id}), bot.inlineButton('Cancel Jio', {callback: 'cancel'})]);

            delete(creating[msg.from.id]);

            let markup = bot.inlineKeyboard(inlineArray);
            return bot.sendMessage(doc.groupId, 'Jio for ' + doc.title + ' created by ' + doc.creator + '!\n' +
                'Please choose from the options below:', { markup });
        });
    }

    jioDB.findOne({_id: creating[msg.from.id]}, 'options').then(doc =>{
        var newOptions = doc.options;
        newOptions.push({optionName: msg.text, voters: []});
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
            optionArray.push([ bot.inlineButton(doc.options[i].optionName, {callback: JSON.stringify({ id: doc._id ,optionName: doc.options[i].optionName}) })]);

        }

        var jioOptionKeyboard = bot.inlineQueryKeyboard(optionArray);

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
    var id = json.id;
    var cboption = json.optionName;

    return jioDB.findOne({_id: monk.id(json.id)}).then(doc => {
        let updatedOptions = doc.options;
        let optionIndex =  _.findIndex(updatedOptions, {optionName: cboption});


        if (optionIndex !== -1){
            //success
            let voteIndex = _.findIndex(updatedOptions[optionIndex].voters, {id: msg.from.id});

            if (voteIndex === -1){
                updatedOptions[optionIndex].voters.push({id: msg.from.id, name: msg.from.first_name + " " +  (msg.from.last_name || "")});
                jioDB.update({_id: monk.id(json.id)}, {$set:{options: updatedOptions}}); //todo: fix concurrency issue
                return;
            } else {


                //alr voted
                return;
            }
        } else {
            //failure
            return; //optionally let bot send a message;
        }
    });
});

bot.on('/showJio', msg => {

    return jioDB.find({groupId: msg.chat.id}).then(doc =>{
        console.log(doc);
        for (var i = 0; i < doc.length; i++){
            let inlineArray = [];
            for (let j = 0; j < doc[i].options.length; j++){
                inlineArray.push([bot.inlineButton(doc[i].options[j].optionName + ' - ' + doc[i].options[j].voters.length, {callback: JSON.stringify({ id: doc[i]._id ,optionName: doc[i].options[j].optionName}) }) ]);
            }

            let markup = bot.inlineKeyboard(inlineArray);
            bot.sendMessage(doc[i].groupId, 'Jio for ' + doc[i].title + ' created by ' + doc[i].creator + '!\n' +
                'Please choose from the options below:', { markup });
        }
    });

});


bot.connect();
