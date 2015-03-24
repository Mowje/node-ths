/* A test script that runs a webserver on 127.0.0.1:2502
*  And creates a small CLI that lets you execute ths commands
*/

var readline = require('readline');
var http = require('http');
var thsBuilder = require('./index');
var ths = new thsBuilder(undefined, undefined, undefined, console.error, console.log, function(controlMessage){console.log('Ctrl: ' + controlMessage)});

ths.on('bootstrap', function(percentage){
	console.log('Process bootstrap percentage: ' + percentage);
});

var server = http.createServer(function (req, res){
	res.writeHead(200, {'Content-Type': 'text/plain'});
	res.end('Hello world!');
});
server.listen(2502, '127.0.0.1');
console.log('Server running at http://127.0.0.1:2502');

var rl = readline.createInterface({input: process.stdin, output: process.stdout});
rl.setPrompt('ths> ');
rl.prompt();
rl.on('line', function(line){
	line = line.trim();
	line = line.split(' ');
	switch (line[0]){
		case 'start':
			var startCallback = function(){
				console.log('Tor has been started');
			}
			if (line.length > 1 && line[1] == 'force'){
				ths.start(true, startCallback);
			} else ths.start(false, startCallback);
			break;
		case 'stop':
			var stopCallback = function(){
				console.log('Tor has been stopped');
			};
			ths.stop(stopCallback);
			break;
		case 'status':
			console.log('Is tor running : ' + (ths.isTorRunning() ? 'Yes' : 'No'));
			break;
		case 'list':
			var serviceList = ths.getServices();
			for (var i = 0; i < serviceList.length; i++){
				console.log('Service ' + (i + 1).toString() + ': ' + serviceList[i].name + ' - ' + serviceList[i].hostname);
				for (var j = 0; j < serviceList[i].ports.length; j++){
					console.log(serviceList[i].ports[j]);
				}
				console.log('');
			}
			break;
		case 'onion':
			//syntax : onion service-name
			if (line.length > 1){
				var serviceName = line[1];
				console.log('Onion name for ' + serviceName + ' : ' + ths.getOnionAddress(serviceName));
			} else {
				console.log('Invalid command. Syntax : onion service-name');
			}
			break;
		case 'async-onion':
			if (line.length > 1){
				var serviceName = line[1];
				ths.getOnionAddress(serviceName, function(err, hostname){
					if (err){
						console.error('Error while reading hostname file: ' + err);
					} else {
						console.log('Onion name for ' + serviceName + ' : ' + hostname);
					}
				});
			} else {
				console.log('Invalid command. Syntax : async-onion service-name');
			}
			break;
		case 'async-add-onion':
			if (line.length > 3){
				var serviceName = line[1];
				var ports = [];
				var actualPort;
				for (var i = 1; i < (line.length - 1) / 2; i++){
					actualPort = line[2*i] + ' ' + line[2*i + 1];
					ports.push(actualPort);
				}

				ths.createHiddenService(serviceName, ports);
				ths.saveConfig();
				ths.getOnionAddress(serviceName, function(err, hostname){
					if (err){
						console.error('Error while reading hostname file: ' + err);
					} else {
						console.log('Onion name for ' + serviceName + ' : ' + hostname);
					}
				});
				ths.signalReload();
			} else {
				console.log('Invalid comamnd. Syntax: async-add-onion service-name onePort target1 [otherPort otherTarget, ...]');
			}
			break;
		case 'add':
			//syntax : add service-name onePort target1 [port2 target2,...]
			if (line.length > 3){
				var serviceName = line[1];
				var ports = [];
				var actualPort;
				for (var i = 1; i < (line.length - 1) / 2; i++){
					actualPort = line[2*i] + ' ' + line[2*i + 1];
					ports.push(actualPort);
				}
				ths.createHiddenService(serviceName, ports, true);
			} else {
				console.log('Invalid command. Syntax : add service-name onePort traget1 [otherPort otherTarget, ...]');
			}
			break;
		case 'delete':
			//syntax : delete service-name
			if (line.length == 2){
				var serviceName = line[1];
				ths.removeHiddenService(serviceName, true);
			} else {
				console.log('Invalid command. Syntax : delete service-name');
			}
			break;
		case 'rename':
			//syntax : rename service-name new-name
			if (line.length == 3){
				var serviceName = line[1];
				var newName = line[2];
				ths.rename(serviceName, newName);
			} else {
				console.log('Invalid command. Syntax : rename service-name new-name');
			}
			break;
		case 'addport':
			//syntax : addport service-name port1 target1 [port2 target2,...]
			if (line.length > 3){
				var serviceName = line[1];
				var ports = [];
				var actualPort;
				for (var i = 1; i < (line.length - 1) / 2; i++){
					actualPort = line[2*i] + ' ' + line[2*i + 1];
					ports.push(actualPort);
				}
				ths.addPorts(serviceName, ports, true);
			} else {
				console.log('Invalid command. Syntax : addport service-name port1 target1 [port2 target2]');
			}
			break;
		case 'removeport':
			//syntax : removeport service-name port1 target1 [port2 target2,...]
			if (line.length > 3){
				var serviceName = line[1];
				var ports = [];
				var actualPort;
				for (var i = 1; i < (line.length - 1) / 2; i++){
					actualPort = line[2*i] + ' ' + line[2*i + 1];
					ports.push(actualPort);
				}
				ths.removePorts(serviceName, ports, false, true);
			} else {
				console.log('Invalid command. Syntax : removeport service-name port1 [port2,...]');
			}
			break;
		case 'addbridge':
			if (line.length > 1 && line.length <= 4){
				var bridgeLine = '';
				for (var i = 1; i < line.length; i++){
					bridgeLine += line[i];
					if (i != line.length - 1) bridgeLine += ' ';
				}
				ths.addBridge(bridgeLine, true);
			} else {
				console.log('Invalid command. Syntax : addbridge [transportName] bridgeIP:bridgePort [fingerprint]');
			}
			break;
		case 'removebridge':
			if (line.length > 1){
				var bridgeAddress = line[1];
				ths.removeBridge(bridgeAddress, true);
			} else {
				console.log('Invalid command. Syntax : removebridge bridgeAddress');
			}
			break;
		case 'listbridges':
			var bridgesList = ths.getBridges();
			if (bridgesList.length == 0){
				console.log('No bridges were added');
				break;
			}
			console.log('Bridges:');
			for (var i = 0; i < bridgesList.length; i++){
				var bridgeLine = '';
				if (bridgesList[i].transport) bridgeLine += bridgesList[i].transport + ' ';
				bridgeLine += bridgesList[i].address;
				if (bridgesList[i].fingerprint) bridgeLine += ' ' + bridgesList[i].fingerprint;
				console.log(bridgeLine);
			}
			break;
		case 'clearbridges':
			ths.clearBridges();
			break;
		case 'addtransport':
			if (line.length == 4){
				var transportLine = '';
				for (var i = 1; i < line.length; i++){
					transportLine += line[i];
					if (i != line.length - 1) transportLine += ' ';
				}
				ths.addTransport(transportLine, true);
			} else {
				console.log('Invalid command. Syntax addtransport transportName exec pathToBinary, or addtransport transportName socks4|socks5 IP:Port');
			}
			break;
		case 'removetransport':
			if (line.length > 1){
				var transportName = line[1];
				ths.removeTransport(transportName, true);
			} else {
				console.log('Invalid command. Syntax removetransport transportName');
			}
			break;
		case 'listtransports':
			var transportsList = ths.getTransports();
			if (transportsList.length == 0){
				console.log('No transports were added');
				break;
			}
			console.log('Transports:');
			for (var i = 0; i < transportsList.length; i++){
				console.log(transportsList[i].name + ' ' + transportsList[i].type + ' ' + transportsList[i].parameter);
			}
			break;
		case 'pid':
			if (ths.isTorRunning()){
				console.log('Tor PID : ' + ths.torPid());
			} else {
				console.log('The Tor process isn\'t running');
			}
			break;
		case 'help':
			console.log('Usage:\n' +
				'start [force]  -- Start the tor process\n' +
				'stop  -- Stop the tor process\n' +
				'list  -- List the configured hidden services\n' +
				'status -- Get whether the tor process is running or not\n' +
				'onion serviceName  -- Get the onion address if the service named "serviceName", if defined\n' +
				'add serviceName port1 traget1 [port2 target2...]  -- Create a hidden service, referenced as "serviceName", with the given targets and ports\n' +
				'delete serviceName  -- Delete the service named "serviceName"\n' +
				'rename oldServiceName newServiceName  -- Rename in the config the "oldServiceName" service into "newServiceName"\n' +
				'addport serviceName port1 target1 [port2 target2 ...]  -- Add ports to service "serviceName"\n' +
				'removeport serviceName  -- Remove ports from "serviceName"\n' +
				'addbridge [transport] bridgeIP:bridgePort [fingerprint]  -- Add a Tor bridge to be used by the instance\n' +
				'removebridge bridgeIP:bridgePort  -- Remove a bridge for this instance\n' +
				'listbridges  -- List the bridges to be used by this instance\n' +
				'clearbridges  -- Clear the list of bridges\n' +
				'addtransport transportName type parameter  -- Add a pluggable transport to the Tor instance\n' +
				'removetransport transportName  -- Remove a pluggable transport\n' +
				'listtransports  -- List the added pluggable transports\n' +
				'pid  -- Get the tor process PID\n' +
				'exit  -- Exit this program');
			break;
		case 'exit':
			process.exit(0);
			break;
		default:
			console.log('Unknown command: ' + line[0]);
			console.log('If you\'re lost, use the "help" command');
			break;
	}
	rl.prompt();
}).on('close', function(){
	ths.stop();
	process.exit(0);
});
