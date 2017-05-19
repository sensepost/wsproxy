// config file

var config = {};

// ports
config.sslport = process.env.WSPROXY_SSLPORT || 8000;  //port used for the https_mitm
config.httpport = process.env.WSPROXY_HTTPPORT || 8001; //port used for http_mitm
config.proxyport = process.env.WSPROXY_PROXYPORT || 8081; //the main proxy port
config.webinterfaceport = process.env.WSPROXY_WEBINTERFACEPORT || 8082; // the web interface port

config.verbose = true;  // verbose stdout output
config.webserver = true; // run the webserver for the user interface
config.maxFrameSize = 205600; // maximum framesize on websocket server
config.maxMessageSize = 411200; // maximum framesize on websocket server
config.logStdOutToFile = true; // write stdout data to log file as well
config.logStdOutFilePath = './logs/'; // log files go here, make sure to include path in .gitignore if under app root

// config items configurable from the user interface
// changes made in web interface are non persistent will not be written back here
// if you want to change the defaults, change them here
config.web = {};
config.web.ignoreRules = {"in":[/^h{1}/,/^o{1}/],"out":[/ping/]}; // ignore rules
config.web.replaceRules = [{"/ping/":"pong"}]; // replace rules
config.web.eEchos = 1; // expected echos
config.web.reuseSocket = false; // attempt to reuse existing websocket for replays, etc. Needed to replay Incoming messages


module.exports = config;




