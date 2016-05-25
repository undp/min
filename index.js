// config load
var config = require('./config.json');

// System modules
var http = require('http');
var fs = require('fs');
var url = require('url');
var path = require('path');

// External modules
var sanitize = require("sanitize-filename");
var Twitter = require('twitter-node-client').Twitter;
var twitter = new Twitter(config.twitter);

// Create a server
http.createServer(function (request, response) {
  // Parse the request containing file name
  let filename = sanitize(path.basename(url.parse(request.url).pathname));

  // Print the name of the file for which request is made.
  if (config.debug) console.log("Request for " + filename + " received.");

  // Read the requested file content from file system
  fs.readFile('data/' + filename, (err, data) => {
    if (err || path.extname(filename) != '.json') {
      if (config.debug) console.log(err);
      // HTTP Status: 404 : NOT FOUND
      // Content Type: text/plain
      response.writeHead(404, {
        'Content-Type': 'text/html'
      });
      response.write('404: NOT FOUND');
    } else {
      // HTTP Status: 200 : OK
      // Content Type: application/json
      response.writeHead(200, {
        'Content-Type': 'application/json'
      });

      // Write the content of the file to response body
      response.write(data.toString());
    }
    // Send the response body 
    response.end();
  });
}).listen(8081);

// Console will print the message
if (config.debug) console.log('Server running at http://127.0.0.1:8081/');

var twitterLastStatus = 0;
var twitterProjectIDRegExp = /^ID\d{8}$/i;

//Callback functions
var twitterError = function (err, response, body) {
    if (config.debug) console.error('ERROR [%s]', err);
};

var twitterSuccess = function (rawdata) {
  if (config.debug) console.time("success");
  
  let data = JSON.parse(rawdata);
  
  let projects = {};
  
  // loop through the Twitter statuses object
  for (let i = 0; i < data.statuses.length; i++) {
    
    let status = data.statuses[i];
    
    // we don't need any retweets here
    if (!status.hasOwnProperty('retweeted_status')) {
    
      // let's check if status has been tweeted from legit account
      if (config.handlewhitelist.indexOf(status.user.screen_name.toLowerCase()) > -1) {
        
        // extract Project ID from hashtags and populate Projects object
        for (let j = 0; j < status.entities.hashtags.length; j++) {
          
          let hashtag = status.entities.hashtags[j].text;  
          
          if (twitterProjectIDRegExp.test(hashtag)) {            
            if (!projects.hasOwnProperty(hashtag)) {
              projects[hashtag] = [];              
            }
            // associate current Status ID with Project
            projects[hashtag].push(status.id);
          }          
          
        }
        
      }
      
    }
    
  }
  
  // save info 
  for (key in projects) {
    
    if (projects[key].length > 0) {
      
      // strip out "ID" from the filename
      let projectID = key.substr(2);

      fs.readFile('data/' + projectID + '.json', {encoding: 'utf8', flag: 'r+'}, (err, content) => {

        // in case file exists let's combine new data with old IDs
        if (!err) {
          let olddata = JSON.parse(content);
          for (let i = 0; i < olddata.length; i++) {
            if (projects[key].indexOf(olddata[i]) < 0) {
              projects[key].unshift(olddata[i]);
            }          
          }
        }
        // write back JSON array of Twitter IDs
        fs.writeFile('data/' + projectID + '.json', JSON.stringify(projects[key]), (err) => {
          if (config.debug) console.error('ERROR [%s]', err);
        });

      });

    }
  }
  
  // update cursor
  if (twitterLastStatus < data.search_metadata.max_id) {
    twitterLastStatus = data.search_metadata.max_id;
  }
  
  // if iteration returned max results count - let's get next page immediately
  if (data.statuses.length == config.count) {
  
    let options = {
      "q": config.hashtag,
      "count": config.count,
      "result_type": "recent"
    };
    
    options.max_id = data.statuses[data.statuses.length-1].id - 1;
    
    twitter.getSearch(options, twitterError, twitterSuccess);
  
  }
  
  if (config.debug) console.timeEnd("success");
};

var twitterWorker = setInterval(function(){
  
  if (config.debug) console.log(new Date());
  
  let options = {
    "q": config.hashtag,
    "count": config.count,
    "result_type": "recent"
  };

  if (twitterLastStatus > 0) {
    options.since_id = twitterLastStatus;
  }

  twitter.getSearch(options, twitterError, twitterSuccess);
  
  
}, config.timeout);