/* A test script that runs a webserver on 127.0.0.1:2502
*  And creates a small CLI that lets you execute ths commands
*/

var readline = require('readline');
var http = require('http');
var thsBuilder = require('./index');
var ths = thsBuilder();

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
				'add serviceName traget1 port1 [target2 port2 ...]  -- Create a hidden service, referenced as "serviceName", with the given targets and ports\n' +
				'delete serviceName  -- Delete the service named "serviceName"\n' +
				'rename oldServiceName newServiceName  -- Rename in the config the "oldServiceName" service into "newServiceName"\n' +
				'addport serviceName port1 target1 [port2 target2 ...]  -- Add ports to service "serviceName"\n' +
				'removeport serviceName  -- Remove ports from "serviceName"\n' +
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
