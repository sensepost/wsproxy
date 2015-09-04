# wsproxy.js - A proxy for websockets 

A simple websocket proxy that allows viewing of websocket requests, repeating requests and "Burp intruder" style replay attacks.
Quick and dirty tool, may have plenty of bugs.

## Install
You need to setup your Nodejs environment, in the project directory:
```
git clone https://github.com/staaldraad/wsproxy.git
npm install
```

This will install all your dependencies ect.

## Usage
The tool should be easy enough to use,
```nodejs wsproxy.js```

To view the requests, a webserver is started up on https://127.0.0.1:8082 by default. To disable this webserver, change webserver=true to webserver=false in wsproxy.js.
To create custom mangle rules, modify "mangle" in wsprocessor.js. Replace rules also get applied here. Replace rules can be hardcoded in wsprocessor.js or altered at runtime through the web-interface.

## Dependencies
websocket - [https://github.com/theturtle32/WebSocket-Node](https://github.com/theturtle32/WebSocket-Node)


