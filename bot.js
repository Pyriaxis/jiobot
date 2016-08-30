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
                return bot.sendMessage(msg.from.id, 'You are already in process of creating/editing a Jio. Please finish or cancel that Jio first.')
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
    //todo: fix multiple DB entry creation
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

    return bot.sendMessage(msg.chat.id, 'Ok, option added. Please continue adding options or press the /finishJio button.', {markup, ask: 'meetupOptions'});
});

bot.on('ask.editOptions', msg => {

    if (msg.text === '/finishJio') {

        let inlineArray = [];

        //group workflow
        return jioDB.findOne({_id: creating[msg.from.id]}).then(doc => {
            for (let i = 0; i < doc.options.length; i++){
                inlineArray.push([bot.inlineButton(doc.options[i].optionName, {callback: JSON.stringify({ id: doc._id ,optionName: doc.options[i].optionName}) }) ]);
            }

            delete(creating[msg.from.id]);

            let markup = bot.inlineKeyboard(inlineArray);
            return bot.sendMessage(doc.groupId, 'Jio for ' + doc.title + ' has been edited by ' + doc.creator + '!\n' +
                'Please choose from the current options below:', { markup });
        });
    }

    jioDB.findOne({_id: creating[msg.from.id]}, 'options').then(doc =>{
        var newOptions = doc.options;
        newOptions.push({optionName: msg.text, voters: []});
        jioDB.update({_id: creating[msg.from.id]}, {$set:{options: newOptions}});
    }).catch( err =>{
        console.log('editOptions error');
    }).then(()=> {db.close()});

    let markup = bot.keyboard([
        ['/finishJio']
    ],{resize: true, once: true});

    return bot.sendMessage(msg.chat.id, 'Ok, option added. Please continue adding options or press the /finishJio button.', {markup, ask: 'editOptions'});
});

// bot.on('inlineQuery', msg => {
//     console.log(msg);
//     let answers = bot.answerList(msg.id, {cacheTime: 5});
//     var query = msg.query;
//     jioDB.findOne({_id: monk.id(query)}).then(doc => {
//         console.log(doc);
//
//         let optionArray = []
//         for (let i = 0; i < doc.options.length; i++){
//             optionArray.push([ bot.inlineButton(doc.options[i].optionName, {callback: JSON.stringify({ id: doc._id ,optionName: doc.options[i].optionName}) })]);
//
//         }
//
//         var jioOptionKeyboard = bot.inlineQueryKeyboard(optionArray);
//
//         answers.addArticle({
//             reply_markup: jioOptionKeyboard,
//             id: doc._id,
//             title: doc.title,
//             description: 'Press to share jio with friends!',
//             message_text: "Hi, this Jio is for " + doc.title + ".\nVote for the options below:"
//         });
//
//         return bot.answerQuery(answers);
//
//     }).catch(err => {
//         console.log(err);
//     });
// });

bot.on('callbackQuery', msg =>{

    console.log(msg);

    var json = JSON.parse(msg.data);

    if (json.add) {
        //add options
        creating[msg.from.id] = json.add;
        return bot.sendMessage(msg.from.id, 'Now send me a list of options to add, one by one.', {ask: 'editOptions'})

    } else if (json.remove){
        return jioDB.findOne({_id: monk.id(json.remove)}).then(doc => {

            let inlineArray = [];
            for (let j = 0; j < doc.options.length; j++) {
                inlineArray.push([bot.inlineButton(doc.options[j].optionName, {
                        callback: JSON.stringify({
                            ro:"1",
                            id:doc._id,
                            o:doc.options[j].optionName
                        })
                })]);
            }

            let markup = bot.inlineKeyboard(inlineArray);

            return bot.sendMessage(msg.from.id, "Click on the option you want removed.",{markup});
        });
    } else if (json.ro) {
        return jioDB.findOne({_id: monk.id(json.id)}).then(doc => {
                var newOptions = doc.options;
                newOptions = _.without(newOptions, _.find(newOptions, {optionName: json.o}));
                return jioDB.update({_id: monk.id(json.id)}, {$set:{options: newOptions}}).then(function(upddoc){
                    let inlineArray = [];
                    for (let j = 0; j < newOptions.length; j++) {
                        inlineArray.push([bot.inlineButton(newOptions[j].optionName, {
                            callback: JSON.stringify({
                                ro:"1",
                                id:json.id,
                                o:newOptions[j].optionName
                            })
                        })]);
                    }

                    let chatId = msg.message.chat.id;
                    let messageId = msg.message.message_id;

                    let markup = bot.inlineKeyboard(inlineArray);

                    bot.editMarkup({chatId, messageId}, {markup});

                    return bot.sendMessage(msg.from.id, json.o + " has been removed." );
                });
        });
    } else {
        //user press response button
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

                    let inlineArray = [];

                    for (let j = 0; j < doc.options.length; j++){
                        inlineArray.push([bot.inlineButton(doc.options[j].optionName + ' - ' + doc.options[j].voters.length,
                            {callback: JSON.stringify({ id: doc._id ,optionName: doc.options[j].optionName}) }) ]);
                    }
                    let markup = bot.inlineKeyboard(inlineArray);

                    let chatId = msg.message.chat.id;
                    let messageId = msg.message.message_id;

                    return bot.editMarkup({chatId, messageId}, {markup});

                } else {

                    //alr voted
                    return;
                }
            } else {
                //failure
                return; //optionally let bot send a message;
            }
        });
    }
});

bot.on('/showJio', msg => {

    return jioDB.find({groupId: msg.chat.id}).then(doc =>{
        console.log(doc);
        for (var i = 0; i < doc.length; i++){
            let inlineArray = [];
            for (let j = 0; j < doc[i].options.length; j++){
                inlineArray.push([bot.inlineButton(doc[i].options[j].optionName + ' - ' + doc[i].options[j].voters.length, 
				{callback: JSON.stringify({ id: doc[i]._id ,optionName: doc[i].options[j].optionName}) }) ]);
            }

            let markup = bot.inlineKeyboard(inlineArray);
            bot.sendMessage(doc[i].groupId, 'Jio for ' + doc[i].title + ' created by ' + doc[i].creator + '!\n' +
                'Please choose from the options below:', { markup });
        }
    });

});

bot.on('/checkMyJio', msg => {
    // Find the list of jios created by sender in this group chat
        return jioDB.find({creatorId: msg.from.id}).then(myJioList => {
            for (var i = 0; i < myJioList.length; i++){
                let inlineArray = [];
                for (let j = 0; j < myJioList[i].options.length; j++){
                    inlineArray.push([bot.inlineButton(myJioList[i].options[j].optionName + ' - ' + myJioList[i].options[j].voters.length,
                        {callback: JSON.stringify({ id: myJioList[i]._id ,optionName: myJioList[i].options[j].optionName}) }) ]);
                }
                inlineArray.push(
                    [bot.inlineButton('Add Options', {callback: JSON.stringify({add: myJioList[i]._id})}),
                     bot.inlineButton('Remove Options', {callback: JSON.stringify({remove: myJioList[i]._id})})],
                    [bot.inlineButton('Delete Jio', {callback: '/deleteJio'})]
                );

                let markup = bot.inlineKeyboard(inlineArray);
                bot.sendMessage(msg.from.id, 'Jio for ' + myJioList[i].title + ' created by ' + myJioList[i].creator + '!\n' +
                    'Please choose from the options below:', { markup });
            }
        });
});

bot.on('/editOptions', msg => {


})

// bot.on('/deleteJio', msg => {
//
// 	// find the list of jios in this group chat
// 	// then find the jio of the creatorId = msg.from.id
// 	return jioDB.find({groupId: msg.chat.id}).then(doc =>{
// 		if (doc){
// 			return jioDB.findOne({creatorId: msg.from.id}).then(toDeleteDoc => {
// 				if (toDeleteDoc){
// 					console.log(toDeleteDoc);
//
// 					let inlineArray = [];
// 					inlineArray.push([bot.inlineButton('Yes', {callback: JSON.stringify('confirmDelete')}), bot.inlineButton('No', {callback: JSON.stringify('cancelDelete'))]);
//
// 					let markup = bot.inlineKeyboard(inlineArray);
// 					bot.sendMessage(msg.chat.id, msg.from.first_name + ', are you sure to delete the Jio: ' + toDeleteDoc.title + '?', { markup, ask: 'deleteOptions' });
// 				} else {
// 					bot.sendMessage(msg.chat.id, msg.from.first_name + ', you have not created a Jio in this group!');
// 				}
// 			});
// 		} else {
// 			bot.sendMessage(msg.chat.id, 'There is no recorded Jio for this group!');
// 		}
// 	});
// });
//
// bot.on('ask.deleteOptions', msg => {
// 	if (msg.text === 'confirmDelete') {
// 		return jioDB.removeOne({creatorId: msg.from.id}, {groupId: msg.chat:id});
// 	} else {
// 		bot.sendMessage(msg.chat.id, 'You have cancelled the Jio deletion.');
// 	}
// });

bot.connect();

// todo: edit options and delete jio