function incommingMsgClick(evt){
    //evt.preventDefault();
    document.getElementById("repeatbtn").disabled = true;
    var url = $(evt).data('id')
    fetchDetails(url)
    $("#repeatbtn").hide() 
    $("#rudebtn").hide() 
    $("#mark").hide() 
    $("#payloadfile").hide() 
    $('#detail_response_div').hide();
    $('#rude_response_div').hide();
    $('#messages_out_list tr').removeClass('success');
    $('#messages_in_list tr').removeClass('success');
    var r = "#in_"+$(evt).data('row')
    $(r).toggleClass('success')
}
function outgoingMsgClick(evt){
    //evt.preventDefault();
    document.getElementById("repeatbtn").disabled = false;
    $("#repeatbtn").show()  
    $("#rudebtn").show() 
    $("#mark").show() 
    $("#payloadfile").show() 
    var url =  $(evt).data('id')
    fetchDetails(url)
    $('#detail_response_div').hide();
    $('#rude_response_div').hide();
    $('#messages_out_list tr').removeClass('success');
    $('#messages_in_list tr').removeClass('success');
    var r = "#out_"+$(evt).data('row')
    $(r).toggleClass('success')
}

$("#savebtn").on('click',function(e){
        e.preventDefault()
        var data = {echo:$('#expected_echo').val(),incomming:$('#ignore_incomming').val(),outgoing:$('#ignore_outgoing').val()}
        
        $.ajax({
             type:"POST",
             url: "/config",
             data: data
        }).done(function(response){
        })

})

 function fetchDetails(url)
 {
    $.ajax({
          type: "GET",
          url:  url
    }).done(function(response){
          //  {"request":[{"proto":"wss://","headers":{"host":"manage-stg.dimensiondata.com","user-agent":"Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:40.0) Gecko/20100101 Firefox/40.0","accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8","accept-language":"en-GB,en;q=0.5","accept-encoding":"gzip, deflate","sec-websocket-version":"13","origin":"https://manage-stg.dimensiondata.com","sec-websocket-extensions":"permessage-deflate","sec-websocket-key":"vaiQeJE1VoFC2/OKnkfhhg==","cookie":"_session_=daa04153-05bb-4a74-8f16-7099729708e0; JSESSIONID=dummy","connection":"keep-alive, Upgrade","pragma":"no-cache","cache-control":"no-cache","upgrade":"websocket","Upgrade":"websocket","Connection":"Upgrade","Sec-WebSocket-Version":"13","Sec-WebSocket-Key":"VFLOp2EGo8R1ma2ErAZqkQ==","Host":"manage-stg.dimensiondata.com"}}],"data":{"type":"utf8","utf8Data":"[\"{\\\"type\\\":\\\"ping\\\"}\"]"}}
          //
          $('#detail_host').val(response.request.proto+response.request.headers.host)
          $('#detail_channel').val(response.channel)
          $('#detail_headers').val(JSON.stringify(response.request.headers))
          var data = response.data
          if(data.type === 'utf8'){
              $('#detail_message').val(response.data.utf8Data)
              document.getElementById("detail_message").readOnly = false;
          }
          else{
              $('#detail_message').val("Binary Data - Unable to process")
              document.getElementById("detail_message").readOnly = true;
          }

    }) 
 }
$("#repeatbtn").on('click',function(event){
        event.preventDefault();
    var headers = $('#detail_headers').val()
    var data = $('#detail_message').val()
    var host = $('#detail_host').val()
    var channel = $('#detail_channel').val()
    var body = {headers:headers,data:data,host:host,channel:channel}
    $('#detail_response').val("")
    $.ajax({
            type: "POST",
            url: "/repeat",
            data: body
    }).done(function(response){
        $('#detail_response').val(response)
        $('#detail_response_div').show();
    }) 

})

$('#mark').on('click',function(event){
    event.preventDefault();
var textComponent = document.getElementById('detail_message');
var startPos = textComponent.selectionStart;
    var endPos = textComponent.selectionEnd;
        selectedText = textComponent.value.substring(startPos, endPos)
        $('#detail_message').val($('#detail_message').val().replace(new RegExp(selectedText),'«'+selectedText+'«'))
})

$("#rudebtn").on('click',function(event){
    event.preventDefault();
    var fileSelect = document.getElementById('payloadfile')
    var files = fileSelect.files;
    if(files.length==0){
        alert("Please provide a payload file!")
        return false
    }
    var headers = $('#detail_headers').val()
    var data = $('#detail_message').val()
    var host = $('#detail_host').val()
    var channel = $('#detail_channel').val()
    var f = files[0]
        var reader = new FileReader();
        reader.onload = function(e){
            var body = {headers:headers,data:data,host:host,channel:channel,payload:window.btoa(e.target.result)}
            $("#rude_response tbody tr").remove(); 
            $.ajax({
                    type: "POST",
                    url: "/berude",
                    data: body
            }).done(function(response){
                $('#detail_response_div').hide();
                $('#rude_response_div').show();
                alert(response.message)
            }) 

        }
        reader.readAsText(f)
   
})
