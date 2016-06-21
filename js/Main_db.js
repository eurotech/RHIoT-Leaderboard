
window.onload = function () {
    WebSocketConnect();
};



// Dashboard parameters
// Ip Address of the Eurotech Device Cloud (EDC) MQTT Broker (WebSockets)
var MQTTBrokerIP = "broker-sandbox.everyware-cloud.com";

// EDC account name; set to that provided in lab instructions
var accountName = "ethdev";

// MQTT User Name; set to that provided in lab instructions
var user = "ethdev";

// MQTT Password; set to that provided in lab instructions
var password = "We!come12345";

// RHIoTTagService APP_ID
var AppId = "org.jboss.rhiot.services.RHIoTTagScanner";

// RHIoTTagService game scores Topic
var scoresTopic = "gameScores";

// DN2016-GWN of the RHIoTTagServices gateway where N = number of gateway at your table
var GatewayName = "DN2016-GWZ";



// Initialize Protobuf
var ProtoBuf = dcodeIO.ProtoBuf;
var ByteBuf = dcodeIO.ByteBuffer;
var pbMsg = ProtoBuf.loadProto("package kuradatatypes;option java_package= \"org.eclipse.kura.core.message.protobuf\";option java_outer_classname = \"KuraPayloadProto\";message KuraPayload {message KuraMetric {enum ValueType{DOUBLE = 0;FLOAT = 1;INT64 = 2;INT32 = 3;BOOL = 4;STRING = 5;BYTES = 6;}required string name = 1;required ValueType type = 2;optional double double_value = 3;optional float float_value = 4;optional int64 long_value = 5;optional int32 int_value = 6;optional bool bool_value = 7;optional string string_value = 8;optional bytes bytes_value = 9;}message KuraPosition{required double latitude=1;required double longitude=2;optional double altitude=3;optional double precision=4;optional double heading=5;optional double speed = 6;optional int64 timestamp=7;optional int32 satellites=8;optional int32 status=9;}optional int64 timestamp = 1;optional KuraPosition position  = 2;extensions 3 to 4999;repeated KuraMetric metric=5000;optional bytes body= 5001;}")
        .build("kuradatatypes.KuraPayload");

var client = new Paho.MQTT.Client(MQTTBrokerIP, 8080, "ClientDashboard-" + GatewayName);

var entries = [];


function WebSocketConnect() {
    client.onConnectionLost = onConnectionLost;
    client.onMessageArrived = onMessageArrived;
    client.startTrace();
    client.connect({
        userName: user,
        password: password,
        onSuccess: onConnect,
        onFailure: onFailToConnect
    }
    );

    function onConnect() {
        console.log("onConnect");
        var topic = accountName + "/" + "+" + "/" + AppId + "/" + scoresTopic + "/#";
        client.subscribe(topic);
        console.log("Subscribed to topic: " + topic);
    };

    function onFailToConnect(info) {
        console.log("Failed to connect: code=" + info.errorCode + ", msg=" + info.errorMessage);
    };

    function onConnectionLost(responseObject) {
        if (responseObject.errorCode !== 0) {
            console.log("onConnectionLost:" + responseObject.errorMessage);
        }
    };

    function onMessageArrived(message) {
        var topic = message.destinationName;
        var topicFragments = topic.split('/');
        //console.log(topicFragments);

        // Get the payload
        var bytes = message.payloadBytes;
        // Check for GZip header
        if (bytes[0] == 31 && bytes[1] == 139 && bytes[2] == 8 && bytes[3] == 0) {
            //if the packet is a GZip buffer, decompress it...

            // Convert the payload to a Base64 string
            var b64 = _arrayBufferToBase64(bytes);
            // Decompress the payload into a string
            var cdecomp = JXG.decompress(b64);
            // Generate a byte array from the decompressed string
            var bytes = new Uint8Array(cdecomp.length);
            for (var i = 0; i < cdecomp.length; ++i) {
                bytes[i] = (cdecomp.charCodeAt(i));
            }
        }

        // Finally decode the packet with Protocol Buffers
        var newMsg = pbMsg.decode(bytes);
        var metrics = newMsg.getMetric();

        //console.log(newMsg);

        var entry = [];
        for (i = 0; i < metrics.length; i++) {
            var metric = newMsg.getMetric()[i];

            if (metric.name === "rhiotTagGW.scoreTagAddress") {
                entry["mac"] = metric.string_value;
            }
            if (metric.name === "rhiotTagGW.score") {
                entry["score"] = metric.int_value;
            }
            if (metric.name === "rhiotTagGW.isNewHighScore") {
                entry["isNewHighScore"] = metric.bool_value;
            }
            if (metric.name === "rhiotTagGW.hits") {
                entry["hits"] = metric.int_value;
            }
        }

        var mac = entry["mac"];
        var oldEntryIndex = getOldEntryIndex(mac);
        if (oldEntryIndex !== -1) {
            var oldEntry = entries[oldEntryIndex];
            if (entry["isNewHighScore"] !== true || entry["score"] < oldEntry["highestScore"]) {
                entry["highestScore"] = oldEntry["highestScore"];
            } else {
                entry["highestScore"] = entry["score"];
            }
            if (entry["hits"] < oldEntry["maxHits"]) {
                entry["maxHits"] = oldEntry["maxHits"];
            } else {
                entry["maxHits"] = entry["hits"];
            }
            entries[oldEntryIndex] = entry;
        } else {
            entry["maxHits"] = entry["hits"];
            entry["highestScore"] = entry["score"];
            entries.push(entry);
        }

        var a = document.getElementById('resultTable');
        var tableContent = "<thead><tr><th>RHIoTTag Address</th><th>Highest Score</th><th>Max Hits</th><th>Last Score</th><th>Hits</th></tr></thead><tbody>";

        for (i = 0; i < entries.length; i++) {
            var tableEntry = entries[i];
            if (isEven(i)) {
                tableContent = tableContent + "<tr>";
            } else {
                tableContent = tableContent + "<tr class=\"alt\">";
            }
            tableContent = tableContent + "<td>" + tableEntry["mac"] + "</td>";
            tableContent = tableContent + "<td>" + tableEntry["highestScore"] + "</td>";
            tableContent = tableContent + "<td>" + tableEntry["maxHits"] + "</td>";
            tableContent = tableContent + "<td>" + tableEntry["score"] + "</td>";
            tableContent = tableContent + "<td>" + tableEntry["hits"] + "</td>";
            tableContent = tableContent + "</tr>";
        }
        tableContent = tableContent + "</tbody>";
        a.innerHTML = tableContent;
    };

    function getOldEntryIndex(macAddress) {
        for (i = 0; i < entries.length; i++) {
            var tableEntry = entries[i];
            if (tableEntry["mac"] === macAddress) {
                return i;
            }
        }
        return -1;
    };

    function isEven(n) {
        return n % 2 === 0;
    };

    function _arrayBufferToBase64(buffer) {
        var binary = '';
        var bytes = new Uint8Array(buffer);
        var len = bytes.byteLength;
        for (var i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[ i ]);
        }
        return window.btoa(binary);
    };

    function _base64ToArrayBuffer(base64) {
        var binary_string = window.atob(base64);
        var len = binary_string.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) {
            var ascii = binary_string.charCodeAt(i);
            bytes[i] = ascii;
        }
        return bytes.buffer;
    };
}
