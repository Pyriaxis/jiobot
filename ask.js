/*
  Name: Ask
  Description: Get direct answers from users!
*/

// Store user list
const userList = {};

module.exports = bot => {

  // On every text message
  bot.on('text', msg => {

    let id = msg.from.id,
      ask = userList[id];
    
    // If no question, then it's a regular message
    if (!ask) return;

    // Delete user from list and send custom event
    delete userList[id];
    bot.event('ask.' + ask, msg, this);
  
  });
  
  // Before call sendMessage method
  bot.on('sendMessage', args => {

    
    let opt = args[2] || {};

    if (opt.ask)
    {
      var ask = opt.ask.data;
      var id = opt.ask.fromId;
    }

    // If "ask" in options, add user to list
    if (ask) userList[id] = ask;
  
  });

};
