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

if (!(ths.getServices().length > 0)){
	ths.createHiddenService('node-test', '80 127.0.0.1:2502');
	ths.saveConfig();
}
ths.start(false, function(){
	console.log('Onion address of the hidden service : ' + ths.getOnionAddress('node-test'));
	var rl = readline.createInterface({input: process.stdin, output: process.stdout});
	rl.question('Press enter to remove the hidden service from the config', function(){
		ths.removeHiddenService('node-test');
		ths.saveConfig();
		rl.question('Press enter to add a hidden service with multiple virtual ports', function(){
			console.log('Is tor running : ' + ths.isTorRunning());
			ths.createHiddenService('node-test', ['80 2502', '81 127.0.0.1:2502', '82 127.0.0.1:2502'], true, true, function(){
				console.log('The new hidden service is : ' + ths.getOnionAddress('node-test'));
				ths.saveConfig();
				rl.question('Press enter to remove some bindings and add some new ones', function(){
					ths.removePorts('node-test', ['81 127.0.0.1:2502', '82 127.0.0.1:2502']);
					ths.saveConfig();
					ths.addPorts('node-test', ['83 2502', '84 2502'], true, true, function(){
						ths.saveConfig();
						console.log('Ports update is over');
						console.log('Here is the service list : ' + JSON.stringify(ths.getServices()));
						rl.question('Press enter to kill the tor process', function(){
							ths.stop();
							rl.close();
							server.close();
						});
					});
				});
			});
		});
	});
});