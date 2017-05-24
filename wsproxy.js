var http = require('http');
var https = require('https');
var fs = require('fs');
var net=require('net');
var WebSocketServer =  require('websocket').server
var WebSocketClient = require('websocket').client;
var processor = require('./wsprocessor.js')
var config = require('./config')

var verbose = config.verbose


var getTimeStamp = processor.getTimeStamp;


if (config.logStdOutToFile) {
    var fs = require('fs');
    var path = require('path');
    if (!fs.existsSync(config.logStdOutFilePath)) 
        fs.mkdirSync(config.logStdOutFilePath)
    if (!fs.lstatSync(config.logStdOutFilePath).isDirectory()) {
        console.log('Log file output path exists and is not a directory.');
        process.exit(1);
    }
    var logFile = path.join(config.logStdOutFilePath,getTimeStamp()+'_wsproxy.txt');

    doLog = function(log){
        data = log.map(function(x){return (x)?x.toString():''}).join(' ');
        console.log(getTimeStamp(),data);
        fs.appendFileSync(logFile, getTimeStamp() + ' ' + data + '\n');
    }

} else {
    doLog = function(log){
        data = log.map(function(x){return (x)?x.toString():''}).join(' ');
        console.log(getTimeStamp(), data);
    }
}



process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
processor.initRules(config, doLog)
if(config.webserver)
        processor.startServer(config.webinterfaceport)

var ssloptions = {
      key: fs.readFileSync('key.pem'),
      cert: fs.readFileSync('cert.pem')
};
net.createServer(tcpConnection).listen(config.proxyport);
function tcpConnection(conn) {
    conn.once('data', function (buf) {
        // A TLS handshake record starts with byte 22.
        var address = (buf[0] === 22) ? config.sslport : config.httpport;
        var proxy = net.createConnection(address, function () {
            proxy.write(buf);
            conn.pipe(proxy).pipe(conn);
        });
    });
}

https_mitm = https.createServer(ssloptions, function (req, res) {
  var port = (req.headers['host'].indexOf(':') > -1) ? req.headers['host'].split(':')[1] : 443;
  var options= { hostname:req.headers['host'],
                 port: port,
                 path: req.url,
                 method: req.method,
                 headers: req.headers
  }
  try{
    var proxy_request = https.request(options);
    proxyRequestor(req,res,proxy_request)
  }catch(err){
  }
}).listen(config.sslport);

http_mitm = http.createServer(function(req,res){
  var port = (req.headers['host'].indexOf(':') > -1) ? req.headers['host'].split(':')[1] : 80;
  var options= { hostname:req.headers['host'],
                 port: port,
                 path: req.url,
                 method: req.method,
                 headers: req.headers
  }
  try{
  var proxy_request = http.request(options);
  proxyRequestor(req,res,proxy_request)
  }catch(err){}
}).listen(config.httpport)

//Handle CONNECT request for HTTPS sessions
http_mitm.on('connect', function(req, res, head) {
    // connect to an origin server
    var mitm_socket = net.connect(config.proxyport, function() {
       res.write('HTTP/1.1 200 Connection Established\r\n' + 'Proxy-agent: Node-Proxy\r\n' + '\r\n');
    });

    mitm_socket.on('data', function(d) { res.write(d)  });
    res.on('data', function(d) { try { mitm_socket.write(d) } catch(err) {}});

    mitm_socket.on('end',function(){ res.end() });
    res.on('end',function()  { mitm_socket.end() });

    mitm_socket.on('close',function(){ res.end() });
    res.on('close',function(){ mitm_socket.end() });

    mitm_socket.on('error',function(){ res.end() });
    res.on('error',function(){ mitm_socket.end() });
});

https_mitm.on('upgrade',function(req,res,head){
    doLog(['Https connection request for channel:',req.url])
})



http_mitm.on('upgrade',function(req,res,head){
    doLog(['Http connection request for channel:', req.url])
})

//start websocket server for both http and https
wsServer = new WebSocketServer({
    httpServer: [http_mitm,https_mitm],
    maxReceivedFrameSize: config.maxFrameSize,
    maxReceivedMessageSize: config.maxMessageSize,
    autoAcceptConnections: false // request event does not get triggered unless this is set false
});

wsServer.on('connect', function(co){
})


// function to create the proxy to server part of the websocket connection chain
// seperated out so we can easily reetablish in case server connection closed before client connection
createClient = function(proto, host, request, origin, connection){
    var preRequests = [];

    //temporary handler for Client<->Proxy connection to catch requests that come before Proxy<->Server session established
    connection.on('message', function(d){
        preRequests.push(d);
        processor.saveOutgoing(request.resourceURL.path,d);
        if (verbose) {doLog(['Received premature request from Client<->Proxy connection:',d.type,d.binaryData,d.utf8Data])}
    })


    var client = new WebSocketClient();
    client.connect(proto+host+request.resourceURL.path, null,origin,request.httpRequest.headers);


    client.on('connectFailed',function(error){
            doLog(['Connect failed!!!!!!']);
            doLog([error])
    })

    client.on('httpResponse', function(response, webSocketClient){
        if (verbose) {
            doLog(['Received non 101 httpResponse']);
            doLog([response.headers,response.statusCode,response.statusMessage]);
        }
    })

    client.on('connect',function(clconn){
        if (verbose) { doLog(['Proxy<->Server websocket connected']) }

        // remove the temporary event listener
        connection.removeAllListeners();

        // now the server side connection is established, send off queued requests
        for (var i = 0; i < preRequests.length; i++) {
            var d = preRequests[i];
            if (verbose) {
                if(d.type==='utf8' && !processor.ignore(1,d.utf8Data))
                    doLog(['Relaying premature request on Proxy<->Server connection:',processor.mangle(d.utf8Data)])
                if(d.type!=='utf8' && !processor.ignore(1,d.binaryData))
                    doLog(['Relaying premature request on Proxy<->Server connection:',d.binaryData])
            }
            (d.type==='utf8') ? clconn.sendUTF(d.utf8Data):clconn.sendBytes(d.binaryData);
        }

        processor.setWsOutgoingConnection(request.resourceURL.path,clconn);
        
        connection.on('message', function(d) {
                processor.saveOutgoing(request.resourceURL.path,d);
                if (verbose) {
                    doLog(['Received message on Client<->Proxy connection:',d.type,d.binaryData,d.utf8Data])
                    if(d.type==='utf8' && !processor.ignore(1,d.utf8Data))
                        doLog(['Relaying on Proxy<->Server connection:',processor.mangle(d.utf8Data)])
                    if(d.type!=='utf8' && !processor.ignore(1,d.binaryData))
                        doLog(['Relaying on Proxy<->Server connection:',d.binaryData])
                }
                (d.type==='utf8') ? clconn.sendUTF(d.utf8Data):clconn.sendBytes(d.binaryData)
                
        });
        clconn.on('message', function(d) {
                processor.saveIncoming(request.resourceURL.path,d);                
                if (verbose) {
                    doLog(['Received message on Proxy<->Server connection:',d.type,d.binaryData,d.utf8Data])
                    if(d.type==='utf8' && !processor.ignore(0,d.utf8Data))
                        doLog(['Relaying on Client<->Proxy connection:',d.utf8Data])
                    if(d.type!=='utf8' && !processor.ignore(0,d.binaryData))
                        doLog(['Relaying on Client<->Proxy connection:',d.binaryData])
                }
                (d.type==='utf8') ? connection.sendUTF(d.utf8Data):connection.sendBytes(d.binaryData)
        });

        clconn.on('error', function(error){
            if (verbose){
                doLog(['Received error on Proxy<->Server connection']);
                doLog([error]);
            }
            
            // clean up
            connection.removeAllListeners();
            clconn.removeAllListeners();
            client.removeAllListeners();
            clconn.close();

            if (connection.connected) {
                if (verbose){doLog(['Client<->Proxy connection still active, attempting reconnect of Proxy<->Server socket'])}
                createClient(proto, host, request, origin, connection);
            }

        });


        connection.on('error', function(error){
            if (verbose) {
                doLog(['Received error on Client<->Proxy connection']);
                doLog([error]);
            }

            // unsure of the best approach here, are there recoverable errors?
            // will just do nothing

        });


        clconn.on('close', function(reasonCode, description){
            if (verbose) {
                doLog(['Received close event on Proxy<->Server connection']);
                doLog([description,reasonCode]);
            }

            // clean up
            connection.removeAllListeners();
            clconn.removeAllListeners();
            client.removeAllListeners();
            
            if (connection.connected) {
                if (verbose){doLog(['Client<->Proxy connection still active, attempting reconnect of Proxy<->Server socket'])}
                createClient(proto, host, request, origin, connection);
            }
            
        });

        connection.on('close', function(reasonCode, description){
            if (verbose) {
                doLog(['Received close event on Client<->Proxy connection']);
                doLog([description, reasonCode]);
            }
            
            processor.socketClosed(request.resourceURL.path);

            // clean up
            connection.removeAllListeners();
            clconn.removeAllListeners();
            client.removeAllListeners();

        });

        /*
        clconn.on('ping', function(cancel, data){
            cancel();
            connection.ping(data);
            if (verbose) {
                doLog(['Received ping event on Proxy<->Server connection']);
                doLog([data]);
            }
        });

        connection.on('ping', function(cancel, data){
            cancel();
            clconn.ping(data);
            if (verbose) {
                doLog(['Received ping event on Client<->Proxy connection']);
                doLog([data]);
            }
        });

        clconn.on('pong', function(data){
            connection.pong(data);
            if (verbose) {
                doLog(['Received pong event on Proxy<->Server connection']);
                doLog([data]);
            }
        });

        connection.on('pong', function(data){
            clconn.pong(data);
            if (verbose) {
                doLog(['Received pong event on Client<->Proxy connection']);
                doLog([data]);
            }
        });
        */

    }) 
}




wsServer.on('request', function(request) {
    processor.saveReq(request)

    if (verbose){doLog(['Client->Proxy websocket connected'])}
    
    var origin = request.httpRequest.headers['origin'] || null;
    var proto = (request.resourceURL.protocol === 'http:' || request.resourceURL.protocol === 'http') ? 'ws://':'wss://'
    if(request.resourceURL.protocol == null)
    {
        if (origin == null) {
            proto = request.httpRequest.connection.encrypted ? 'wss://':'ws://';
        } else {
            proto = origin.split(':')[0] === 'http' ? 'ws://':'wss://';
        }
    }
    var host = request.httpRequest.headers['host'];

    var connection = request.accept(null, request.origin); 
    processor.setWsIncomingConnection(request.resourceURL.path,connection);
    console.log('Open',request.resourceURL.path);
    processor.socketOpen(request.resourceURL.path);
    createClient(proto, host, request, origin, connection);
    
});



proxyRequestor = function(req,res,proxy_request){
  proxy_request.addListener('response', function (proxy_response) {
            proxy_response.addListener('data', function(chunk) {
              res.write(chunk, 'binary');
            });
            proxy_response.addListener('end', function() {
              res.end();
            });
      res.writeHead(proxy_response.statusCode, proxy_response.headers);
  });
  req.addListener('data', function(chunk) {
    proxy_request.write(chunk, 'binary');
  });
  req.addListener('end', function() {
    proxy_request.end();
  });
}
