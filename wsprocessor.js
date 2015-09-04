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

var webserver = false
var ignoreRules = []
var replaceRules = []
var expect = 1
var savedReqs = {}
var savedOutgoing = {}
var savedIncomming = {}
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/scripts'));
app.set('view engine', 'jade');

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

exports.initRules = function(){
    ignoreRules = {"in":[/^h{1}/,/^o{1}/],"out":[/ping/]}
    replaceRules = [{"/ping/":"pong"}]
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

exports.saveReq = function(request){
    if(!savedReqs[request.resourceURL.path])
            savedReqs[request.resourceURL.path] = []
    var proto = (request.resourceURL.protocol === 'http:' || request.resourceURL.protocol === 'http') ? 'ws://':'wss://'
    if(request.resourceURL.protocol == null)
    {
        proto = request.httpRequest.headers['origin'].split(':')[0] === 'http' ? 'ws://':'wss://'
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

exports.saveIncomming = function(channel,message){
    if(message.type==='utf8' && ignoreMessage(0,message.utf8Data)){
        return 1; //don't save request as it's in the ignore list
    }
    if(!savedIncomming[channel])
            savedIncomming[channel] = []
    savedIncomming[channel].push(message)

    var msg = "Incomming: "+savedIncomming[channel].length-1
    if(message.type==='utf8')
        msg = ""+message.utf8Data.substring(0,30)

    if(webserver)
       sendToInterface({type:'incomming',title:msg,channel:channel,id:savedIncomming[channel].length-1})
}

exports.startServer = function(){
        webserver = true
        var options = {
          key: fs.readFileSync('key.pem'),
          cert: fs.readFileSync('cert.pem')
        };
        httpsserver = https.createServer(options,app).listen(8082);
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

sendToInterface = function(message){
     if(connection)
         connection.sendUTF(JSON.stringify(message))
}

app.get('/', function (req, res) {
     res.render('main',{expect:expect,ignore:{_in:ignoreRules["in"],_out:ignoreRules["out"]}})
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

app.get('/incomming/:channel/:id', function(req,res){
    var resp = {request:savedReqs[req.params.channel],channel:req.params.channel,data:savedIncomming[req.params.channel][parseInt(req.params.id)]}
    res.json(resp)
})

app.post('/config',function(req,res){
    expect = parseInt(req.body.echo)
    ignoreRules["in"] = []
    ignoreRules["out"] = []
    var inc = req.body.incomming.split(',')
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
    var client = new WebSocketClient();

    var tmpexpect = expect
    client.connect(host+path, null,headers['origin'],headers);
    client.on('httpResponse',function(resp){
        res.end("Got a NON-Websocket response. Are you authenticated?")
    })
    client.on('connect',function(clconn){
        clconn.sendUTF(data)
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
})

app.post('/berude',function(req,res){
    var headers = JSON.parse(req.body.headers)
    var host = req.body.host
    var path = req.body.channel
    var data = req.body.data
    var client = new WebSocketClient();
    var b = new Buffer(req.body.payload, 'base64')
    var payload = b.toString().split('\n');

    client.connect(host+path, null,headers['origin'],headers);
    client.on('httpResponse',function(resp){
        res.json({result:1,message:"Got a NON-Websocket response. Are you authenticated?"})
    })
    client.on('connect',function(clconn){
        res.json({result:0,message:"Starting session"})
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
        }


    })
})
