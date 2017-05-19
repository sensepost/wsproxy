# wsproxy.js - A proxy for websockets 

A simple websocket proxy that allows viewing of websocket requests, repeating requests and "Burp intruder" style replay attacks.
Quick and dirty tool, may have plenty of bugs.

For a more detailed write-up regarding the tool, see:  https://sensepost.com/blog/2015/another-intercepting-proxy/

## Install
You need to setup your Nodejs environment, in the project directory:
```
git clone https://github.com/sensepost/wsproxy.git
npm install
```

This will install all your dependencies etc.

## Usage
The tool should be easy enough to use,

```
nodejs wsproxy.js
```

To view the requests, a webserver is started up on https://127.0.0.1:8082 by default, changable in config.js. To disable this webserver, change config.webserver=true to config.webserver=false in config.js.
To create custom mangle rules, modify "mangle" in wsprocessor.js. Replace rules also get applied here. Replace rules can be modified in config.js or altered at runtime through the web-interface.

## Dependencies
websocket - [https://github.com/theturtle32/WebSocket-Node](https://github.com/theturtle32/WebSocket-Node)

A complete list is available in package.json

## License
WSProxy is licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License (http://creativecommons.org/licenses/by-nc-sa/4.0/) Permissions beyond the scope of this license may be available at http://sensepost.com/contact us/.
