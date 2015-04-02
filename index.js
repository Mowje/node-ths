var spawn = require('child_process').spawn;
var fs = require('fs');
var os = require('os');
var net = require('net');
var path = require('path');
var util = require('util');
var events = require('events');
var passhash = require('./passhash');

module.exports = Ths;

function Ths(thsFolder, socksPortNumber, controlPortNumber, torErrorHandler, torMessageHandler, torControlMessageHandler, keysFolder){
	events.EventEmitter.call(this);

	var self = this;
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

	var extractBootstrap = function(line){
		var bootstrapState = /Bootstrapped (\d{1,3})%/gm.exec(line);
		if (bootstrapState && bootstrapState[1]) return bootstrapState[1];
		else return undefined;
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
	var onionWatchers = {};

	/*
	* Initializing file paths
	*/

	//Path to folder that will contain the config file and hidden services' keys
	var baseFolder = thsFolder ? thsFolder : process.cwd();
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
		for (var i = 0; i < transports.length; i++){
			configFile += 'ClientTransportPlugin ' + getTransportLine(transports[i]) + '\n';
		}
		if (bridges.length > 0) configFile += 'UseBridges 1\n';
		for (var i = 0; i < bridges.length; i++){
			configFile += 'Bridge ' + getBridgeLine(bridges[i]) + '\n';
		}
		for (var i = 0; i < services.length; i++){
			var hiddenServiceFolder = path.join(hiddenServicePath, services[i].name);
			configFile += 'HiddenServiceDir ' + path.join(hiddenServicePath, services[i].name) + '\n';
			for (var j = 0; j < services[i].ports.length; j++){
				configFile += 'HiddenServicePort ' + services[i].ports[j] + '\n';
			}
		}
		fs.writeFileSync(destPath, configFile);
	}

	function buildPath(folderPath){
		if (!(fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory())){
			if (!fs.existsSync(path.join(folderPath, '..'))) buildPath(path.join(folderPath, '..'));
			else fs.mkdirSync(folderPath);
		}
	}

	function watchOnion(serviceName, cb){
		var onionPath = path.join(hiddenServicePath, serviceName, 'hostname');
		onionWatchers[serviceName] = setInterval(onionHandler, 50);

		function onionHandler(){
			fs.exists(onionPath, function(onionExists){
				if (onionExists){
					clearInterval(onionWatchers[serviceName]);
					onionWatchers[serviceName] = null;

					fs.readFile(onionPath, {encoding: 'utf8'}, function(err, hData){
						if (err) cb(err);
						else cb(undefined, hData.replace('\n', '').replace('\r', '')); //Trimming any line feeds and carriage returns
					});
				}
			});
		}
	}

	/*var buildParamArray = function(){
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
	};*/

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
		} else if (Array.isArray(configLoadObj.services) && Array.isArray(configLoadObj.bridges) && Array.isArray(configLoadObj.transports)){
			services = [];
			bridges = [];
			transports = [];
			var servicesConfig = configLoadObj.services;
			var bridgesConfig = configLoadObj.bridges;
			var transportsConfig = configLoadObj.transports;

			for (var i = 0; i < servicesConfig.length; i++){
				if (servicesConfig[i].name && servicesConfig[i].ports && Array.isArray(servicesConfig[i].ports)){
					services.push({name: servicesConfig[i].name, ports: servicesConfig[i].ports});
				}
			}
			for (var i = 0; i < bridgesConfig.length; i++){
				if (bridgesConfig[i].address){
					bridges.push({transport: bridgesConfig[i].transport, address: bridgesConfig[i].address, fingerprint: bridgesConfig[i].fingerprint});
				}
			}
			for (var i = 0; i < transportsConfig.length; i++){
				if (transportsConfig[i].name && transportsConfig[i].type && transportsConfig[i].parameter){
					transports.push({name: transportsConfig[i].name, type: transportsConfig[i].type, parameter: transportsConfig[i].parameter});
				}
			}
		} else throw new SyntaxError('invalid config file');
		return true;
	};

	this.loadConfig = loadConfig;

	function saveConfig(){
		if (fs.existsSync(configFilePath)) fs.unlinkSync(configFilePath); //Overwriting didn't seem to work. Hence I delete the file (if it exists) before writing the new config
		fs.writeFileSync(configFilePath, JSON.stringify({services: services, transports: transports, bridges: bridges}, null, '\t'));
		saveTorrc(torrcFilePath);
	};

	this.saveConfig = saveConfig;

	function signalReload(){
		if (torProcess && controlClient){
			controlClient.write('SIGNAL RELOAD\r\n');
		}
	}

	this.signalReload = signalReload;

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
				var containedFiles = fs.readdirSync(path.join(hiddenServicePath, serviceName));
				for (var j = 0; j < containedFiles.length; j++){
					fs.unlinkSync(path.join(hiddenServicePath, serviceName, containedFiles[j]));
				}
				fs.rmdirSync(path.join(hiddenServicePath, serviceName));
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
					self.removeHiddenService(serviceName, applyNow);
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

	this.getOnionAddress = function(serviceName, cb){
		if (!(typeof serviceName == 'string' && checkServiceName(serviceName))) throw new TypeError('Invalid service name');
		if (cb && typeof cb != 'function') throw new TypeError('When provided, cb must be a function');

		for (var i = 0; i < services.length; i++){
			if (services[i].name == serviceName) {

				if (cb) {
					watchOnion(serviceName, cb);
					return;
				}

				var fileReadCount = 0;
				while (fileReadCount < 3){ //Why did I write this? Answer : Trying 3 times in vain in case the files are not here yet...
					try {
						return fs.readFileSync(path.join(hiddenServicePath, serviceName, 'hostname')).toString('utf8').replace('\n', '').replace('\r', '');
					} catch (e){
						if (fileReadCount < 3) fileReadCount++;
						else throw e;
					}
				}
				break;
			}
		}
		if (torProcess){
			var e = new TypeError('Service name ' + serviceName + ' not found in config');
			if (cb) cb(e);
			else throw e;
		} else return undefined;
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
			servicesCopy[i].hostname = self.getOnionAddress(servicesCopy[i].name);
		}
		return servicesCopy;
	};

	this.start = function(force, bootstrapCallback){
		if (typeof bootstrapCallback == 'function') self.once('bootstrapped', bootstrapCallback);

		//if (!services || services.length == 0) throw new TypeError('Please load the config before calling the start() method');
		if (torProcess) {
			if (force) {
				//Kills the process and waits it to shutdown, then recalls start a second time, with force == false and passes the callback given at the first call
				self.stop(function(){
					self.start(false, bootstrapCallback);
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

				torProcess.stdout.setEncoding('utf8');
				torProcess.stdout.on('data', function(data){
					if (data.indexOf('[warn]') > -1 || data.indexOf('[err]') > -1){
						if (data.indexOf('Could not bind to') > -1){
							//Port binding error. Emit corresponding event
							var addressBindingError = /Could not bind to (\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{1,5})/g.exec(data);
							var unbindableAddress = addressBindingError && addressBindingError[1];
							if (unbindableAddress) self.emit('bindingError', unbindableAddress);
						}
						if (torErrorHandler) torErrorHandler(data);
						//console.log('Error with the tor process : ' + data.toString('utf8'));
					} else {
						if (torMessageHandler) torMessageHandler(data);
					}

					var bootstrapState = extractBootstrap(data);
					if (bootstrapState){
						bootstrapState = Number(bootstrapState);
						if (isNaN(bootstrapState)){
							console.error('Bootstrap state cannot be casted into a number');
						} else {
							self.emit('bootstrap', bootstrapState);
						}
					}

					if (data.indexOf('Bootstrapped 100%') > -1) {
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
						self.emit('bootstrapped');
					}
				});
			}, torCommand);
		}
	};

	this.stop = function(callback){
		if (!torProcess) {
			return;
		}
		torProcess.on('close', function(){
			self.emit('stop');
		});
		if (callback && typeof callback == 'function') {
			self.once('stop', callback);
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

	this.addBridge = function(bridgeLine, save){
		var parsedBridgeLine = parseBridgeLine(bridgeLine);
		if (!parsedBridgeLine) return false;
		bridges.push(parsedBridgeLine);
		if (save) saveConfig();
		return true;
	};

	this.removeBridge = function(bridgeAddress, save){
		for (var i = 0; i < bridges.length; i++){
			if (bridges[i].address == bridgeAddress){
				bridges.splice(i, 1);
				if (save) saveConfig();
				return true;
			}
		}
		return false;
	};

	this.setBridges = function(newBridges){
		if (!(newBridges && Array.isArray(newBridges))) throw new TypeError('Invalid type for newBridges parameter; it must be an array of strings');
		for (var i = 0; i < newBridges.length; i++) if (!(parseBridgeLine(newBridges[i]))) throw new TypeError('Invalid bridge line: ' + newBridges[i]);

		bridges = null;
		bridges = [];
		for (var i = 0; i < newBridges.length; i++) bridges.push(parseBridgeLine(newBridges[i]));
		saveConfig();
	};

	this.clearBridges = function(){
		this.setBridges([]);
	};

	this.getBridges = function(){
		var bridgesCopy = [];
		for (var i = 0; i < bridges.length; i++){
			bridgesCopy.push(bridges[i]);
		}
		return bridgesCopy;
	};

	var minBridgeLineLength = 7; //A simple IP. 1.1.1.1 for example
	var fingerprintRegex = /^[a-f|0-9]{40}$/i;
	function parseBridgeLine(bridgeLine){
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
		//Checking number of elements in the bridgeLine
		if (!(bridgeLineParts.length >= 1 && bridgeLineParts.length <= 3)) return false;
		var transport, address, fingerprint;
		if (bridgeLineParts.length == 1){
			address = bridgeLineParts[0];
			if (!isAddressPart(address)) return false;

		} else if (bridgeLineParts.length == 2){
			if (isAddressPart(bridgeLineParts[0])){
				address = bridgeLineParts[0];
				fingerprint = bridgeLineParts[1];
				if (!isFingerprintPart(fingerprint)) return false;
			} else if (isAddressPart(bridgeLineParts[1])){
				transport = bridgeLineParts[0];
				address = bridgeLineParts[1];
			} else return false;
		} else {
			transport = bridgeLineParts[0];
			address = bridgeLineParts[1];
			fingerprint = bridgeLineParts[2];

			if (!isAddressPart(address)) return false;
			if (!isFingerprintPart(fingerprint)) return false;
		}
		return {transport: transport, address: address, fingerprint: (fingerprint ? fingerprint.toLowerCase() : undefined)};
	}

	function isAddressPart(part){
		if (typeof part != 'string') return false;
		var addressParts = part.split(':');
		if (addressParts.length != 2) return false;
		var ipAddress = addressParts[0];
		var portAddress = parseInt(addressParts[1], 10);
		if (!(net.isIP(ipAddress) && !isNaN(portAddress) && portAddress > 0 && portAddress < 65536)) return false;
		return true;
	}

	function isFingerprintPart(part){
		if (typeof part != 'string') return false;
		return fingerprintRegex.test(part);
	}

	function getBridgeLine(bridgeConfigObj){
		var bridgeLine = '';
		if (bridgeConfigObj.transport) bridgeLine += bridgeConfigObj.transport + ' ';
		bridgeLine += bridgeConfigObj.address;
		if (bridgeConfigObj.fingerprint) bridgeLine += ' ' + bridgeConfigObj.fingerprint;
		return bridgeLine;
	}

	this.addTransport = function(transportLine, save){
		var parsedTransportLine = parseTransportLine(transportLine);
		if (!parsedTransportLine) return false;
		transports.push(parsedTransportLine);
		if (save) saveConfig();
		return true;
	};

	this.removeTransport = function(transportName, save){
		for (var i = 0; i < transports.length; i++){
			if (transports[i].name == transportName){
				transports.splice(i, 1);
				if (save) saveConfig();
				return true;
			}
		}
		return false;
	};

	this.setTransports = function(transportsArray){
		if (!Array.isArray(transportsArray)) throw new TypeError('transportsArray must be an array');
		for (var i = 0; i < transportsArray.length; i++) if (!parseTransportLine(transportsArray[i])) throw new TypeError('Transport parameter ' + transportsArray[i] + ' is invalid');

		transports = null;
		transports = [];
		for (var i = 0; i < transportsArray.length; i++) transports.push(parseTransportLine(transportsArray[i]));
		saveConfig();
	};

	this.getTransports = function(){
		var transportsCopy = [];
		for (var i = 0; i < transports.length; i++){
			transportsCopy.push({name: transports[i].name, type: transports[i].type, parameter: transports[i].parameter, args: transports[i].args});
		}
		return transportsCopy;
	};

	function parseTransportLine(transportLine){
		if (typeof transportLine != 'string') return false;

		//Remove leading spaces
		while (transportLine.indexOf(' ') == 0){
			transportLine = transportLine.substring(1);
		}
		//Remove trailing spaces
		while (transportLine.lastIndexOf(' ') == transportLine.length - 1){
			transportLine = transportLine.substring(0, transportLine.length - 2);
		}
		var transportLineParts = transportLine.split(/ +/);
		if (transportLineParts.length < 3) return false;
		var transportName = transportLineParts[0];
		var transportType = transportLineParts[1];
		var transportParam = transportLineParts[2];
		var transportArgs = [];
		for (var i = 3; i < transportLineParts.length; i++){
			transportArgs.push(transportLineParts[i]);
		}
		if (!(transportType == 'exec' || transportType == 'socks4' || transportType == 'socks5')) return false;
		if (transportType == 'exec'){ //Pluggable transport
			//Should it be validated??
			//Just check it's a path, for the least
			var enclosingFolder = path.join(transportParam, '..');
			if (!fs.existsSync(enclosingFolder)) return false;
		} else { //Local server transport
			if (!isAddressPart(transportParam)) return false;
		}
		return {name: transportName, type: transportType, parameter: transportParam, args: transportArgs};
	}

	function getTransportLine(transportConfigObj){
		return transportConfigObj.name + ' ' + transportConfigObj.type + ' ' + transportConfigObj.parameter + (transportConfigObj.args.length > 0 ? ' ' + transportConfigObj.args.join(' ') : '');
	}

}

util.inherits(Ths, events.EventEmitter);
