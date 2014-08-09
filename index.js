var spawn = require('child_process').spawn;
var fs = require('fs');
var os = require('os');
var net = require('net');
var path = require('path');
var passhash = require('./passhash');

module.exports = function(thsFolder, socksPortNumber, controlPortNumber, torErrorHandler, torMessageHandler, torControlMessageHandler, keysFolder){

	//var fseperator = (os.platform().indexOf('win') == 0) ? '\\' : '/'; //Selects the right path seperator corresponding to the OS platform
	var fseperator = path.sep;
	var torCommand = 'tor';
	var torProcess; //Reference to the tor process
	var controlClient; //Socket to the tor control port

	var controlHash, controlPass;

	var checkServiceName = function(serviceName){
		var regexCheck = /^[a-zA-Z0-9-_]+$/;
		return regexCheck.test(serviceName);
	};

	if (socksPortNumber && typeof socksPortNumber != 'number') throw new TypeError('When defined, socksPortNumber must be a number');
	if (controlPortNumber && typeof controlPortNumber != 'number') throw new TypeError('When defined, controlPortNumber must be a number');

	if (torMessageHandler && typeof torMessageHandler != 'function') throw new TypeError('When defined, torMessageHandler must be a function');
	if (torErrorHandler && typeof torErrorHandler != 'function') throw new TypeError('When defined, torErrorHandler must be a function');
	if (torControlMessageHandler && typeof torControlMessageHandler != 'function') throw new TypeError('When defined, torControlMessageHandler must be a function');
	if (keysFolder && typeof keysFolder != 'string') throw new TypeError('When defined, keysFolder must be a string');

	var portNumber = (socksPortNumber || 9999).toString();
	var controlPort = (controlPortNumber || 9998).toString();
	var services = [];
	var bridges = [];
	var transports = [];

	/*
	* Initializing file paths
	*/

	//Path to folder that will contain the config file and hidden services' keys
	var baseFolder = thsFolder ? path.join(process.cwd(), thsFolder) : process.cwd();
	//if (baseFolder && !(baseFolder.lastIndexOf(fseperator) == baseFolder.length - 1)) baseFolder += fseperator; //Adding the path seperator if necessary
	baseFolder = path.join(baseFolder, 'ths-data');
	if (!fs.existsSync(baseFolder)) buildPath(baseFolder); //Creating the folder if it doesn't exist
	//Path to config file, inside baseFolder
	var configFilePath =  path.join(baseFolder, 'ths.conf');
	if (fs.existsSync(configFilePath)) loadConfig();
	//Path to DataDirectory folder, necessary for the tor process. Note that each instance must have its own DataDirectory folder, seperate from other instances
	var torDataDir = path.join(baseFolder, 'torData');
	if (!fs.existsSync(torDataDir)) buildPath(torDataDir); //Creating the DataDirectory if it doesn't exist
	//Path to the folder that will contain the private keys and hostnames for each hidden service
	var hiddenServicePath = keysFolder || path.join(baseFolder, 'keys');
	if (!fs.existsSync(hiddenServicePath)) fs.mkdirSync(hiddenServicePath);
	//Path to the torrc file. Create a basic file it doesn't exist
	var torrcFilePath = path.join(baseFolder, 'torrc');
	if (!fs.existsSync(torrcFilePath)) saveTorrc(torrcFilePath);

	/*
	* Config files and related methods
	*/

	function saveTorrc(destPath){
		var configFile = "";
		configFile += 'SocksPort ' + portNumber + '\n';
		configFile += 'ControlPort ' + controlPort + '\n';
		configFile += 'DataDirectory ' + torDataDir + '\n';
		configFile += 'HashedControlPassword ' + controlHash + '\n';
		for (var i = 0; i < services.length; i++){
			var hiddenServiceFolder = path.join(hiddenServicePath, services[i].name);
			configFile += 'HiddenServiceDir ' + path.join(hiddenServicePath, services[i].name) + '\n';
			for (var j = 0; j < services[i].ports.length; j++){
				configFile += 'HiddenServicePort ' + services[i].ports[j] + '\n';
			}
		}
		for (var i = 0; i < transports.length; i++){
			configFile += 'ClientTransportPlugin ' + transports[i].name + ' exec ' +
		}
		for (var i = 0; i < bridges.length; i++){
			configFile += 'Bridge ' + bridges[i] + '\n';
		}
		fs.writeFileSync(destPath, configFile);
	}

	function buildPath(folderPath){
		if (!(fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory())){
			if (!fs.existsSync(path.join(folderPath, '..'))) buildPath(path.join(folderPath, '..'));
			else fs.mkdirSync(folderPath);
		}
	}

	var buildParamArray = function(){
		var params = [];
		params.push('--DataDirectory');
		params.push(torDataDir);
		params.push('--SocksPort');
		params.push(portNumber);
		params.push('--ControlPort');
		params.push(controlPort);
		for (var i = 0; i < services.length; i++){
			params.push('--HiddenServiceDir');
			params.push(hiddenServicePath + services[i].name);
			for (var j = 0; j < services[i].ports.length; j++){
				params.push('--HiddenServicePort');
				params.push(services[i].ports[j]);
			}
		}
		return params;
	};

	function loadConfig(){
		var configLoadObj;
		var configText
		try {
			configText = fs.readFileSync(configFilePath, {encoding: 'utf8'});
			configLoadObj = JSON.parse(configText);
		} catch (e) {
			//throw e;
			//console.log('Error on THS config load\n' + e);
			return false;
		}
		if (Array.isArray(configLoadObj)){ //throw new TypeError('config file must be a JSON array containing hidden services details');
			services = [];
			for (var i = 0; i < configLoadObj.length; i++){
				if (configLoadObj[i].name && configLoadObj[i].ports && Array.isArray(configLoadObj[i].ports)){
					services.push({name: configLoadObj[i].name, ports: configLoadObj[i].ports});
				}
			}
		} else if (Array.isArray(configLoadObj.services) && Array.isArray(configLoadObj.bridges)){
			services = [];
			bridges = [];
			var servicesConfig = configLoadObj.services;
			var bridgesConfig = configLoadObj.bridges;

			for (var i = 0; i < servicesConfig.length; i++){
				if (servicesConfig[i].name && servicesConfig[i].ports && Array.isArray(servicesConfig[i].ports)){
					services.push({name: servicesConfig[i].name, ports: servicesConfig[i].ports});
				}
			}
			for (var i = 0; i < bridgesConfig.length; i++){

			}
		} else throw new SyntaxError('');
		return true;
	};

	this.loadConfig = loadConfig;

	function saveConfig(){
		if (fs.existsSync(configFilePath)) fs.unlinkSync(configFilePath); //Overwriting didn't seem to work. Hence I delete the file (if it exists) before writing the new config
		fs.writeFileSync(configFilePath, JSON.stringify({services: services, bridges: bridges}, null, '\t'));
		saveTorrc(torrcFilePath);
	};

	this.saveConfig = saveConfig;

	function signalReload(){
		if (torProcess && controlClient){
			controlClient.write('SIGNAL RELOAD\r\n');
		}
	}

	/*
	* Hidden services manageement
	*/

	this.createHiddenService = function(serviceName, ports, applyNow){
		if (!(ports && serviceName)) throw new TypeError('Missing parameters');
		if (!checkServiceName(serviceName)) throw new TypeError('Invalid service name. It should only contain letters, digits, hyphens and underscore (no spaces allowed)');
		//Checking that the service name isn't already taken
		for (var i = 0; i < services.length; i++){
			if (services[i].name == serviceName){
				throw new TypeError('A service called "' + serviceName + '" already exists');
				return;
			}
		}
		var service = {};
		service.name = serviceName;
		if (Array.isArray(ports)){
			service.ports = ports;
		} else {
			service.ports = [ports];
		}
		services.push(service);
		if (applyNow){
			saveConfig();
			signalReload();
		}
	};

	this.removeHiddenService = function(serviceName, applyNow){
		if (!checkServiceName(serviceName)) throw new TypeError('Invalid service name. It should only contain letters, digits, hyphens and underscore (no spaces allowed)');
		var found = false;
		for (var i = 0; i < services.length; i++){
			if (services[i].name == serviceName) {
				services.splice(i, 1);
				var containedFiles = fs.readdirSync(hiddenServicePath + serviceName);
				for (var j = 0; j < containedFiles.length; j++){
					fs.unlinkSync(path.join(hiddenServicePath, serviceName, containedFiles[j]));
				}
				fs.rmdirSync(hiddenServicePath + serviceName);
				found = true;
				break;
			}
		}
		if (applyNow){
			saveConfig();
			signalReload();
		}
		return found;
	};

	this.rename = function(serviceName, newName){
		if (!(typeof serviceName == 'string' && typeof newName == 'string')) throw new TypeError('serviceName and newName must be strings');
		if (!checkServiceName(serviceName)) throw new TypeError('invalid service name');
		if (!checkServiceName(newName)) throw new TypeError('invalid new service name');

		var found = false;
		for (var i = 0; i < services.length; i++){
			if (services[i].name == serviceName){
				services[i].name = newName;
				fs.renameSync(hiddenServicePath + serviceName, hiddenServicePath + newName);
				saveConfig();
				found = true;
				break;
			}
		}
		return found;
	};

	this.addPorts = function(serviceName, ports, applyNow){
		if (!serviceName) throw new TypeError('Service name can\'t be null');
		if (!checkServiceName(serviceName)) throw new TypeError('Invalid service name. It should only contain letters, digits, hyphens and underscore (no spaces allowed)');
		for (var i = 0; i < services.length; i++){
			if (services[i].name == serviceName){
				if (Array.isArray(ports)){
					for (var j = 0; j < ports.length; j++){
						services[i].ports.push(ports[j]);
					}
				} else services[i].ports.push(ports);
				if (applyNow){
					saveConfig();
					signalReload();
				}
				return;
			}
		}
		throw new TypeError('Service ' + serviceName + ' not found');
	};

	this.removePorts = function(serviceName, ports, deleteIfEmptied, applyNow){
		if (!serviceName) throw new TypeError('Service name can\'t be null');
		if (!checkServiceName(serviceName)) throw new TypeError('Invalid service name. It should only contain letters, digits, hyphens and underscore (no spaces allowed)');
		for (var i = 0; i < services.length; i++){
			if (services[i].name == serviceName){ //Finds the service with the given serviceName
				//If the given ports array is an array, then remove ports one by one
				if (Array.isArray(ports)){
					for (var j = 0; j < ports.length; j++){ // For each port entry in ports parameter
						for (var k = 0; k < services[i].ports.length; k++){ //For each ports entry in service "serviceName"
							if (services[i].ports[k] == ports[j]){
								services[i].ports.splice(k, 1);
								break;
							}
						}
					}
				} else {
					// If the given ports is not an array (hence, normally, only one ports entry)
					for (var k = 0; k < services[i].ports.length; k++){
						if (services[i].ports[k] == ports){
							services[i].ports.splice(k, 1);
							break;
						}
					}
				}
				if (deleteIfEmptied && services[i].ports.length == 0){
					this.removeHiddenService(serviceName, applyNow);
				}
				if (applyNow){
					saveConfig();
					signalReload();
				}
				return;
			}
		}
		throw new TypeError('Service name not found in config');
	};

	this.getOnionAddress = function(serviceName){
		for (var i = 0; i < services.length; i++){
			if (services[i].name == serviceName) {
				var fileReadCount = 0;
				while (fileReadCount < 3){ //Why did I write this? Answer : Trying 3 times in vain in case the files are not here yet...
					try {
						return fs.readFileSync(path.join(hiddenServicePath, serviceName, 'hostname')).toString('utf8').replace('\n', '');
					} catch (e){
						if (fileReadCount < 3) fileReadCount++;
						else throw e;
					}
				}
				break;
			}
		}
		if (torProcess) throw new TypeError('Service name ' + serviceName + ' not found in config');
		else return undefined;
	};

	this.getServices = function(){
		var servicesCopy = [];
		//Do a deep copy of the services array
		for (var i = 0; i < services.length; i++){
			var serviceObjCopy = {};
			serviceObjCopy.name = String(services[i].name);
			serviceObjCopy.ports = [];
			for (var j = 0; j < services[i].ports.length; j++){
				serviceObjCopy.ports.push(String(services[i].ports[j]));
			}
			servicesCopy.push(serviceObjCopy);
		}
		for (var i = 0; i < servicesCopy.length; i++){
			servicesCopy[i].hostname = this.getOnionAddress(servicesCopy[i].name);
		}
		return servicesCopy;
	};

	this.start = function(force, bootstrapCallback){
		//if (!services || services.length == 0) throw new TypeError('Please load the config before calling the start() method');
		if (torProcess) {
			if (force) {
				//Kills the process and waits it to shutdown, then recalls start a second time, with force == false and passes the callback given at the first call
				this.stop(function(){
					this.start(false, bootstrapCallback);
				});
			} else {
				throw new TypeError('A Tor instance is already running. Please stop before starting a new one.');
			}
		} else {
			passhash(8, function(pass, hash){
				controlPass = pass;
				controlHash = hash;
				saveTorrc(torrcFilePath);
				torProcess = spawn(torCommand, ['-f', torrcFilePath]);

				if (torErrorHandler){ //Attach to stderr if torErrorHandler is defined.
					torProcess.stderr.setEncoding('utf8');
					torProcess.stderr.on('data', function(data){
						//console.log('Error from child tor process:\n' + data.toString('utf8'));
						torErrorHandler(data);
					});
				}

				torProcess.stdout.on('data', function(data){
					if (data.toString().indexOf('[warn]') > -1 || data.toString().indexOf('[err]') > -1){
						if (torErrorHandler) torErrorHandler(data.toString('utf8'));
						//console.log('Error with the tor process : ' + data.toString('utf8'));
					} else {
						if (torMessageHandler) torMessageHandler(data.toString('utf8'));
					}
					if (data.toString('utf8').indexOf('Bootstrapped 100%') > -1) {
						controlClient = net.connect({host: '127.0.0.1', port: Number(controlPort)}, function(){
							controlClient.write('AUTHENTICATE "' + controlPass + '"\r\n');
							//console.log("Tor process PID : " + torProcess.pid);
						});
						controlClient.on('data', function(data){
							data = data.toString();
							if (torControlMessageHandler) torControlMessageHandler(data.toString());
							//if (showTorControlMessages) console.log('Message from ControlPort: ' + data);
							//console.log('Message from ControlPort: ' + data.toString());
						});
						if (typeof bootstrapCallback == 'function') bootstrapCallback();
					}
				});
			});
		}
	};

	this.stop = function(callback){
		if (!torProcess) {
			return;
		}
		if (callback && typeof callback == 'function') {
			torProcess.on('close', function(){
				callback();
			});
		}
		if (controlClient){
			controlClient.end();
			controlClient.destroy();
			controlClient = undefined;
		}
		torProcess.kill();
		torProcess = undefined;
	};

	this.isTorRunning = function(){
		return !(typeof torProcess === 'undefined');
	};

	//Sets node exit event handler, to kill the tor process if running
	process.on('exit', function(){
		if (controlClient){
			controlClient.end();
			controlClient.destroy();
			controlClient = undefined;
		}
		if (torProcess){
			//console.log('Killing the Tor child process');
			torProcess.kill();
			torProcess = undefined;
		}
	});

	this.torPid = function(){
		if (torProcess) return torProcess.pid;
		else return null;
	};

	this.socksPort = function(){
		return portNumber;
	};

	this.controlPass = function(){
		return controlPass;
	};

	this.getTorCommand = function(){
		return torCommand;
	};

	this.setTorCommand = function(_torCommand){
		if (typeof _torCommand != 'string') throw new TypeError('the torCommand must be a string');
		torCommand = _torCommand;
	};

	this.setBridges = function(newBridges){
		if (!(newBridges && Array.isArray(newBridges))) throw new TypeError('Invalid type for newBridges parameter; it must be a parameter');
		for (var i = 0; i < newBridges.length; i++) if (!isBridgeLine(newBridges[i])) throw new TypeError('Invalid bridge line: ' + newBridges[i]);

		bridges = null;
		bridges = [];
		for (var i = 0; i < newBridges.length; i++) bridges.push(newBridges[i]);
		saveConfig();
	};

	this.getBridges = function(){
		var bridgesCopy = new Array(bridges.length);
		for (var i = 0; i < bridges.length; i++){
			bridgesCopy.push(bridges[i]);
		}
		return bridgesCopy;
	};

	var minBridgeLineLength = 7; //A simple IP. 1.1.1.1 for example
	var fingerprintRegex = /^[A-F|0-9]{40}$/i;
	function isBridgeLine(bridgeLine){
		if (typeof bridgeLine != 'string') return false;

		//Removing leading spaces
		while (bridgeLine.indexOf(' ') == 0 && bridgeLine.length > minBridgeLineLength){
			bridgeLine = bridgeLine.substring(1);
		}
		//Removing trailing spaces
		while (bridgeLine.lastIndexOf(' ') == bridgeLine.length - 1 && bridgeLine.length > minBridgeLineLength){
			bridgeLine = bridgeLine.substring(0, bridgeLine.length - 2);
		}
		var bridgeLineParts = bridgeLine.split(/ +/);
		//Checking number of elements in the bridgeline
		if (!(bridgeLineParts.length == 1 || bridgeLineParts.length == 2 || bridgeLineParts.length == 3)) return false;
		if (bridgeLineParts.length == 1){
			var address = bridgeLineParts[0];
			var addressParts = address.split(':');
			if (addressParts.length != 2) return false;
			var ipAddress = addressParts[0];
			var portAddress = parseInt(addressParts[1], 10);
			if (!(net.isIP(ipAddress) && !isNaN(portAddress) && portAddress > 0 && portAddress < 65536)) return false;

		} else if (bridgeLineParts.length == 2){
			if (isAddressPart[bridgeLineParts[0]]){
				var address = bridgeLineParts[0];
				var fingerprint = bridgeLineParts[1];
				if (!isFingerprintPart(fingerprint)) return false;
			} else if (isAddressPart(bridgeLineParts[1])){
				var transport = bridgeLineParts[0];
				var address = bridgeLineParts[1];
			} else return false;
		} else {
			var transport = bridgeLineParts[0];
			var address = bridgeLineParts[1];
			var fingerprint = bridgeLineParts[2];

			if (!isAddressPart(address)) return false;
			if (!isFingerprintPart(fingerprint)) return false;
			//fingerprint = fingerprint.toUpperCase();
		}

		return true;

		function isAddressPart(part){
			var addressParts = part.split(':');
			if (addressParts.length != 2) return false;
			var ipAddress = addressParts[0];
			var portAddress = parseInt(addressParts[1], 10);
			if (!(net.isIP(ipAddress) && !isNaN(portAddress) && portAddress > 0 && portAddress < 65536)) return false;
			return true;
		}

		function isFingerprintPart(part){
			return fingerprintRegex.test(part);
		}
	}

	this.addTransport = function(transport){

	};

	this.removeTransport = function(transportName){

	};

	this.setTransports = function(transportsArray){

	};

	this.getTransports = function(){
		
	};

};
