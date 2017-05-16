var http = require('http');
var https = require('https');
var fs = require('fs');
var net=require('net');
var WebSocketServer =  require('websocket').server
var WebSocketClient = require('websocket').client;
var processor = require('./wsprocessor.js')

var sslport = 8000  //port used for the https_mitm
var httpport = 8001 //port used for http_mitm
var proxyport = 8081 //the main proxy port
var verbose = true 
var webserver = true

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
processor.initRules()
if(webserver)
        processor.startServer()

var ssloptions = {
      key: fs.readFileSync('key.pem'),
      cert: fs.readFileSync('cert.pem')
};
net.createServer(tcpConnection).listen(proxyport);
function tcpConnection(conn) {
    conn.once('data', function (buf) {
        // A TLS handshake record starts with byte 22.
        var address = (buf[0] === 22) ? sslport : httpport;
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
}).listen(sslport);

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
}).listen(httpport)

//Handle CONNECT request for HTTPS sessions
http_mitm.on('connect', function(req, res, head) {
    // connect to an origin server
    var mitm_socket = net.connect(proxyport, function() {
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
    console.log(req.url);
})



http_mitm.on('upgrade',function(req,res,head){
    console.log(req.url)
})

//start websocket server for both http and https
wsServer = new WebSocketServer({
    httpServer: [http_mitm,https_mitm],
    autoAcceptConnections: true 
});

wsServer.on('connect', function(co){
});


wsServer.on('request', function(request) {
    processor.saveReq(request)
    var connection = request.accept(null, request.origin);
    var client = new WebSocketClient();
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
    client.connect(proto+host+request.resourceURL.path, null,origin,request.httpRequest.headers);
    client.on('connectFailed',function(error){
            console.log('Connect failed!!!!!!');
            console.log(error)
    })

    client.on('connect',function(clconn){
        connection.on('message', function(d) {
                processor.saveOutgoing(request.resourceURL.path,d);
                (d.type==='utf8') ? clconn.sendUTF(d.utf8Data):clconn.sendBytes(d.binaryData)
                if(verbose ){
                        console.log(d.type,d.binaryData,d.utf8Data)
                        if(d.type==='utf8' && !processor.ignore(1,d.utf8Data))
                            console.log("Outgoing: ",processor.mangle(d.utf8Data))
                        if(d.type!=='utf8' && !processor.ignore(1,d.binaryData))
                            console.log("Outgoing: ",d.binaryData)
                }
        });
        clconn.on('message', function(d) {
                processor.saveIncomming(request.resourceURL.path,d);
                (d.type==='utf8') ? connection.sendUTF(d.utf8Data):connection.sendBytes(d.binaryData)
                if(verbose){
                        console.log(d.type,d.binaryData,d.utf8Data)
                        if(d.type==='utf8' && !processor.ignore(0,d.utf8Data))
                            console.log("Incomming: ",d.utf8Data)
                        if(d.type!=='utf8' && !processor.ignore(0,d.binaryData))
                            console.log("Incomming: ",d.binaryData)
                }
        });
    })
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

