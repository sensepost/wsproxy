var https = require('https');
var fs = require('fs');
var express = require('express');
var app = express()
var bodyParser = require('body-parser');
var multer = require('multer');
var WebSocketClient = require('websocket').client;
var WebSocketServer =  require('websocket').server
var wsServer = null
var connection = null
var verbose = false;

var webserver = true 
var ignoreRules = []
var replaceRules = []
var expect = null
var reuseSocket = false
var savedReqs = {}
var savedOutgoing = {}
var savedIncoming = {}
var wsOutgoingConnections = {}
var wsIncomingConnections = {}
var doLog = null
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/scripts'));
app.set('view engine', 'pug');

ignoreMessage = function(direction,data){
    var ignore = false
    if(direction===0){
            if(ignoreRules["in"].length === 0)
                    return false
            for(var i = 0; i< ignoreRules["in"].length; i++){
                if(data.match(ignoreRules["in"][i]) != null)
                        return true
            }

    }
    else if(direction===1){
            if(ignoreRules["out"].length === 0)
                    return false
            for(var i = 0; i< ignoreRules["out"].length; i++){
                if(data.match(ignoreRules["out"][i]) != null)
                        return true
            }

    }
    return ignore

}


exports.getTimeStamp = function(){
    var cd = new Date();
    var d = cd.getDate();
    var m = cd.getMonth()+1;
    var y = cd.getFullYear();
    var h = cd.getHours();
    var mi = cd.getMinutes();
    var s = cd.getSeconds();
    var dt = y+((m<10)?"0":"")+m+((d<10)?"0":"")+d;
    var t = ((h<10)?"0":"")+h+((mi<10)?"0":"")+mi+((s<10)?"0":"")+s;
    return dt + t;
}


exports.initRules = function(config, logFunc){
    ignoreRules = config.web.ignoreRules;
    replaceRules = config.web.replaceRules;
    expect = config.web.eEchos;
    reuseSocket = config.web.reuseSocket;
    doLog = logFunc;
    verbose = config.verbose;
}

exports.ignore = function(direction,data){
        return ignoreMessage(data)
}

exports.replace = function(data){
    var tmp_data = data
    return tmp_data
}

exports.mangle = function(data){
    //var tmp_data  = data.replace(/\\/g,'').replace(/\[\"/,'[').replace(/\"\]/,']').replace(/\"\{/,'{').replace(/\}\"/,'}')
    //tmp_data = JSON.stringify(JSON.parse(tmp_data), null, 2)
    var tmp_data = data
    return tmp_data
}

exports.securityCheck = function(data){

}

exports.setWsOutgoingConnection = function(channel, conn){
    wsOutgoingConnections[channel] = conn;
}

exports.setWsIncomingConnection = function(channel, conn){
    wsIncomingConnections[channel] = conn;
}


exports.saveReq = function(request){
    if(!savedReqs[request.resourceURL.path])
            savedReqs[request.resourceURL.path] = []
    var proto = (request.resourceURL.protocol === 'http:' || request.resourceURL.protocol === 'http') ? 'ws://':'wss://'
    
    if(request.resourceURL.protocol == null)
    {
        if (request.httpRequest.headers['origin'] == null) {
            proto = request.httpRequest.connection.encrypted ? 'wss://':'ws://';
        } else {
            proto = request.httpRequest.headers['origin'].split(':')[0] === 'http' ? 'ws://':'wss://';
        }
    }
    savedReqs[request.resourceURL.path] = {proto:proto,headers:request.httpRequest.headers}
    if(webserver)
       sendToInterface({type:'channel',title:request.resourceURL.path,id:request.resourceURL.path})
}

exports.saveOutgoing = function(channel,message){
    if(message.type==='utf8' && ignoreMessage(1,message.utf8Data)){
        return 1; //don't save request as it's in the ignore list
    }
    if(!savedOutgoing[channel])
            savedOutgoing[channel] = []
    savedOutgoing[channel].push(message)

    var msg = "Outgoing: "+savedOutgoing[channel].length-1
    if(message.type==='utf8')
        msg = ""+message.utf8Data.substring(0,30)

    if(webserver)
       sendToInterface({type:'outgoing',title:msg,channel:channel,id:savedOutgoing[channel].length-1})
}

exports.saveIncoming = function(channel,message){
    if(message.type==='utf8' && ignoreMessage(0,message.utf8Data)){
        return 1; //don't save request as it's in the ignore list
    }
    if(!savedIncoming[channel])
            savedIncoming[channel] = []
    savedIncoming[channel].push(message)

    var msg = "Incoming: "+savedIncoming[channel].length-1
    if(message.type==='utf8')
        msg = ""+message.utf8Data.substring(0,30)

    if(webserver)
       sendToInterface({type:'incoming',title:msg,channel:channel,id:savedIncoming[channel].length-1})
}

exports.startServer = function(port){
        webserver = true
        var options = {
          key: fs.readFileSync('key.pem'),
          cert: fs.readFileSync('cert.pem')
        };
        httpsserver = https.createServer(options,app).listen(parseInt(port));
        wsServer = new WebSocketServer({
            httpServer: httpsserver,
            autoAcceptConnections: false
        });
        wsServer.on('request', function(request) {
            connection = request.accept('share-protocol', request.origin);
            connection.on('message', function(message) {
                if (message.type === 'utf8') {
                    connection.sendUTF(message.utf8Data);
                }
                else if (message.type === 'binary') {
                    connection.sendBytes(message.binaryData);
                }
            });
            connection.on('close', function(reasonCode, description) {
                //console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
            });
        });
}

exports.socketClosed = function(channel){
    sendToInterface({type:'socketclosed',channel:channel})
}

exports.socketOpen = function(channel){
    sendToInterface({type:'socketopen',channel:channel})
}


sendToInterface = function(message){
     if(connection)
         connection.sendUTF(JSON.stringify(message))
}

// returns true if socket is open
checkSocket = function(sock) {
    return (sock.connected && sock.state == 'open');
}

// inform web interface of client<->proxy socket state
sendSocketState = function(channel) {
    if (wsIncomingConnections[channel] && reuseSocket) {
        if (checkSocket(wsIncomingConnections[channel])) {
            exports.socketOpen(channel);
        } else {
            exports.socketClosed(channel);
        }
    }
}

// refill channels list
fillChannels = function() {
    Object.keys(savedReqs).forEach(function(key){
        sendToInterface({type:'channel',title:key,id:key})
    })
}


app.get('/', function (req, res) {
    res.render('main',{reuseSocket:reuseSocket,expect:expect,ignore:{_in:ignoreRules["in"],_out:ignoreRules["out"]}});
    //setTimeout(sendSocketState, 2000);
    setTimeout(fillChannels, 2000);
});

app.get('/channels/:id', function(req,res){
    res.send(savedReqs[req.params.id])
})

app.get('/channels',function(req,res){
    res.send(Object.keys(savedReqs))
})

app.get('/outgoing/:channel/:id', function(req,res){
    var resp = {request:savedReqs[req.params.channel],channel:req.params.channel,data:savedOutgoing[req.params.channel][parseInt(req.params.id)]}
    res.json(resp)
})

app.get('/incoming/:channel/:id', function(req,res){
    var resp = {request:savedReqs[req.params.channel],channel:req.params.channel,data:savedIncoming[req.params.channel][parseInt(req.params.id)]}
    sendSocketState(wsIncomingConnections[req.params.channel], req.params.channel);
    res.json(resp)
})

app.post('/config',function(req,res){
    expect = parseInt(req.body.echo)
    reuseSocket = (req.body.reuseSocket == 'true');
    ignoreRules["in"] = []
    ignoreRules["out"] = []
    var inc = req.body.incoming.split(',')
    var outc = req.body.outgoing.split(',')
    for(var i=0;i<inc.length; i++){
            v = inc[i].replace(/\//g,'')
            if(v!=="")
                ignoreRules["in"].push(new RegExp(v))
    }
    for(var i=0;i<outc.length; i++){
            v = outc[i].replace(/\//g,'')
            if(v !== "")
                ignoreRules["out"].push(new RegExp(v))
    }
    res.send({success:0})
})


app.post('/repeat',function(req,res){
    var headers = JSON.parse(req.body.headers)
    var host = req.body.host
    var path = req.body.channel
    var data = req.body.data
    var direction = req.body.direction
    var client = new WebSocketClient();
    var origin = headers['origin'] || null;
    var tmpexpect = expect
    if (direction === 'incoming'){
        if (checkSocket(wsIncomingConnections[path]) && reuseSocket) {
            wsIncomingConnections[path].sendUTF(data);
            res.end(exports.getTimeStamp() + ' Sent using existing connection. Response will be in Messages.');
            if (verbose) 
                doLog(['Resent data on existing incoming connection:',path,'Data:',data]);
        } else {
            // existing socket not open
            res.end('Websocket not open, could not send.');
        }
    } 
    if (direction === 'outgoing') {
        // try and reuse existing connection if configured to
        if (checkSocket(wsOutgoingConnections[path]) && reuseSocket) {
            wsOutgoingConnections[path].sendUTF(data);
            res.end(exports.getTimeStamp() + ' Sent using existing connection. Response will be in Messages.');
            if (verbose) 
                doLog(['Resent data on existing outgoing connection:',path,'Data:',data]);
        } else {
            client.connect(host+path, null,origin,headers);
            client.on('httpResponse',function(resp){
                res.end("Got a NON-Websocket response. Are you authenticated?")
            })
            client.on('connect',function(clconn){
                clconn.sendUTF(data)
                if (verbose) 
                    doLog(['Resent data on new outgoing connection:',data]);
                clconn.on('message', function(d) {
                        //console.log(d)
                        if(tmpexpect-- === 0){
                        //clconn.close()
                                if(d.type==='utf8')
                                res.send(d.utf8Data)
                                else
                                res.end("Binary data - Can't display")

                        }
                });
            })
        }
    }

})

app.post('/berude',function(req,res){
    var headers = JSON.parse(req.body.headers)
    var host = req.body.host
    var path = req.body.channel
    var data = req.body.data
    var direction = req.body.direction
    var client = new WebSocketClient();
    var origin = headers['origin'] || null;
    var b = new Buffer(req.body.payload, 'base64')
    var payload = b.toString().split('\n');


    if (direction === 'incoming'){
        if (checkSocket(wsIncomingConnections[path]) && reuseSocket) {
            res.json({result:0,message:"Starting session using existing socket"})
            for(var i=0; i<payload.length; i++){
                var dd = data.replace(/«\b\w+\b«/i,payload[i])
                //console.log(dd)
                wsIncomingConnections[path].sendUTF(dd)
                if (verbose) 
                    doLog(['Sent "rude" data on existing incoming connection:',path,'Data:',data]);
            }
        } else {
            // existing socket not open
            res.json({result:1,message:"Websocket not open, could not send."})
        }
    } 
    if (direction === 'outgoing') {
        // try and reuse existing connection
        if (checkSocket(wsOutgoingConnections[path]) && reuseSocket) {
            res.json({result:0,message:"Starting session using existing socket"})
            for(var i=0; i<payload.length; i++){
                var dd = data.replace(/«\b\w+\b«/i,payload[i])
                //console.log(dd)
                wsOutgoingConnections[path].sendUTF(dd)
                if (verbose) 
                    doLog(['Sent "rude" data on existing outgoing connection:',path,'Data:',data]);
            }
        } else {
            res.json({result:0,message:"Starting session using new socket"})
            client.connect(host+path, null,origin,headers);
            client.on('httpResponse',function(resp){
                res.json({result:1,message:"Got a NON-Websocket response. Are you authenticated?"})
            })
            client.on('connect',function(clconn){
                
                clconn.on('message', function(d) {
                        //console.log("message",d)
                        if(d.type==='utf8')
                            sendToInterface({type:'rude',message:d.utf8Data,payload:""})
                        else
                            sendToInterface({type:'rude',message:"Binary Data",payload:""})

                });
                for(var i=0; i<payload.length; i++){
                    var dd = data.replace(/«\b\w+\b«/i,payload[i])
                    //console.log(dd)
                    clconn.sendUTF(dd)
                    if (verbose) 
                        doLog(['Sent "rude" data on new outgoing connection:',data]);
                }
            })
        }
    }

})
