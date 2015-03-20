var ths = require('./index');
var fs = require('fs');
var net = require('net');
var path = require('path');

module.exports = function(globalConfigPath, keysFolder, torInstancesFolder, _hsPerProcess, _torProcessSpawnDelay, torProcessOptionsObj){

	if (typeof globalConfigPath != 'string') throw new TypeError('globalConfigPath must be a string');
	if (typeof keysFolder != 'string') throw new TypeError('keysFolder must be a string');
	if (typeof torInstancesFolder != 'string') throw new TypeError('torInstancesFolder must be a string');
	if (_hsPerProcess && !(typeof _hsPerProcess == 'number' && _hsPerProcess > 0 && Math.floor(_hsPerProcess) == _hsPerProcess)) throw new TypeError('When defined, _hsPerProcess must be a positive integer number');
	if (_torProcessSpawnDelay && !(typeof _torProcessSpawnDelay == 'number' && _torProcessSpawnDelay > 0 && Math.floor(_torProcessSpawnDelay) == _torProcessSpawnDelay)) throw new TypeError('When defined, _torProcessSpawnDelay must be a positive integer number');
	if (torProcessOptionsObj && typeof torProcessOptionsObj != 'object') throw new TypeError('When defined, torProcessOptionsObj')

	if (torProcessOptionsObj){
		if (torProcessOptionsObj.torErrorHandler && typeof torProcessOptionsObj.torErrorHandler != 'function') throw new TypeError('When defined, torErrorHandler must be a function');
		if (torProcessOptionsObj.torMessageHandler && typeof torProcessOptionsObj.torMessageHandler != 'function') throw new TypeError('When defined, torMessageHandler must be a function');
		if (torProcessOptionsObj.torControlMessageHandler && typeof torProcessOptionsObj.torControlMessageHandler != 'function') throw new TypeError('When defined, torControlMessageHandler must be a function');
		if (torProcessOptionsObj.torCommand && typeof torProcessOptionsObj.torCommand != 'string') throw new TypeError('When defined, torCommand must be a string');
		if (torProcessOptionsObj.socksPort && !(Array.isArray(torProcessOptionsObj.socksPort) || typeof torProcessOptionsObj.socksPort == 'number')) throw new TypeError('when defined, socksPort must either be a number or an array of numbers')
	}

	var socks = []; //Copy of the socks ports we want
	var socksDistribution; //List of undistributed ports. Refilled at each start up from `socks`

	if (torProcessOptionsObj.socksPort){
		if (Array.isArray(torProcessOptionsObj.socksPort)){
			for (var i = 0; i < torProcessOptionsObj.socksPort.length; i++){
				var currentPort = torProcessOptionsObj.socksPort[i];
				if (!(typeof currentPort == 'number' && currentPort == Math.floor(currentPort) && currentPort > 0 && currentPort < 65536)) throw new TypeError('socksPort must be integer numbers n, where 0 < n < 65536');
				socks.push(currentPort);
			}
		} else {
			if (!(torProcessOptionsObj.socksPort == Math.floor(torProcessOptionsObj.socksPort) && torProcessOptionsObj.socksPort > 0 && torProcessOptionsObj.socksPort < 65536)) throw new TypeError('socksPort must be an integer number n, where 0 < n < 65536');
			socks[0] = torProcessOptionsObj.socksPort;
		}
	}

	var checkServiceName = function(serviceName){
		var regexCheck = /^[a-zA-Z0-9-_]+$/;
		return regexCheck.test(serviceName);
	};

	/*if (!(fs.existsSync(globalConfigPath) && fs.statSync(globalConfigPath).isFile())){

	}*/

	var globalServiceList = []; //The list containing all the hidden services managed by the ths-pool
	var instanceServiceList = []; //The list containing the hidden services managed by the last ths instance configured
	var bridges = []; //List of bridges to be used by all the Tor processes of the pool
	var transports = []; //List of transports to be used by all the Tor processes of the pool
	var torProcesses = [];
	var hsPerProcess = _hsPerProcess || 2500;
	var torProcessSpawnDelay = _torProcessSpawnDelay || 600000;
	var processesRunning = false;

	var queueInterval;
	var addQueue = [];
	var onionWatchers = {};

	if (fs.existsSync(globalConfigPath)){
		if (fs.statSync(globalConfigPath).isFile()){ if (!loadConfig()) console.log('Error while loading existing config'); }
		else throw new TypeError('the given globalConfigPath is not a file');
	}

	if (!fs.existsSync(path.join(globalConfigPath, '..'))) fs.mkdirSync(path.join(globalConfigPath, '..'));

	function loadConfig(){
		if (!(fs.existsSync(globalConfigPath) && fs.statSync(globalConfigPath).isFile())) throw new TypeError('Error while loading config file. Either the path/file doesn\'t exist, or the path isn\'t a file');
		var configLoadObj;
		var configText;
		try {
			configText = fs.readFileSync(globalConfigPath, {encoding: 'utf8'});
			configLoadObj = JSON.parse(configText);
		} catch (e){
			return false;
		}
		//if (!Array.isArray(configLoadObj)) throw new TypeError('service config file must be a JSON array containing hidden services details');
		if (Array.isArray(configLoadObj)){
			globalServiceList = [];
			for (var i = 0; i < configLoadObj.length; i++){
				if (configLoadObj[i].name && configLoadObj[i].ports && Array.isArray(configLoadObj[i].ports)){
					globalServiceList.push({name: configLoadObj[i].name, ports: configLoadObj[i].ports});
				}
			}
		} else if (Array.isArray(configLoadObj.services) && Array.isArray(configLoadObj.bridges) && Array.isArray(configLoadObj.transports)){
			globalServiceList = [];
			bridges = [];
			transports = [];

			var servicesConfig = configLoadObj.services;
			var bridgesConfig = configLoadObj.bridges;
			var transportsConfig = configLoadObj.transports;

			for (var i = 0; i < servicesConfig.length; i++){
				if (servicesConfig[i].name && servicesConfig[i].ports && Array.isArray(servicesConfig[i].ports)){
					globalServiceList.push({name: servicesConfig[i].name, ports: servicesConfig[i].ports});
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
		}
		return true;
	}

	this.loadConfig = loadConfig;

	function saveConfig(){
		/*if (fs.existsSync(globalConfigPath)) {
			if (!fs.statSync(globalConfigPath).isFile()) throw new TypeError('Error while saving config file. Either the given path/file doesn\'t exists, or the path isn\'t a directory');
			fs.unlinkSync(globalConfigPath);
		}*/
		fs.writeFileSync(globalConfigPath, JSON.stringify({services: globalServiceList, bridges: bridges, transports: transports}, null, '\t'));
		// Anything in addition regarding the tor child processes?
	}

	this.saveConfig = saveConfig;

	function watchOnion(serviceName, cb){
		var onionPath = path.join(keysFolder, serviceName, 'hostname');
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

	this.createHiddenService = function(serviceName, ports, applyNow){
		if (!(ports && serviceName)) throw new TypeError('Missing parameters');
		if (!(typeof serviceName == 'string' && checkServiceName(serviceName))) throw new TypeError('Invalid service name. It should be a string containing letters, digits, hyphens and underscore (no spaces allowed)');
		if (!(typeof ports == 'string' || Array.isArray(ports))) throw new TypeError('ports must either be a string or an array');
		//Checking that the service name isn't already taken
		for (var i = 0; i < globalServiceList.length; i++){
			if (globalServiceList[i].name == serviceName){
				throw new TypeError('A service called ' + serviceName + ' already exists');
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
		if (processesRunning && applyNow){
			addQueue.push(service);
			//saveConfig();
		} else {
			globalServiceList.push(service);
			if (applyNow) saveConfig();
		}
	};

	this.removeHiddenService = function(serviceName, applyNow){
		if (!(typeof serviceName == 'string' && checkServiceName(serviceName))) throw new TypeError('Invalid service name. It should be a string containing letters, digits, hyphens and underscore (no spaces allowed)');
		var found = false;
		for (var i = 0; i < globalServiceList.length; i++){
			if (globalServiceList[i].name == serviceName){
				globalServiceList.splice(i, 1);
				var containedFiles = fs.readdirSync(path.join(keysFolder, serviceName));
				for (var j = 0; j < containedFiles.length; j++){
					fs.unlinkSync(path.join(keysFolder, serviceName, containedFiles[j]));
				}
				fs.rmdirSync(path.join(keysFolder, serviceName));
				found = true;
				break;
			}
		}
		if (applyNow) saveConfig();
		return found;
	};

	this.rename = function(serviceName, newName){
		if (!(typeof serviceName == 'string' && checkServiceName(serviceName))) throw new TypeError('invalid service name');
		if (!(typeof newName == 'string' && checkServiceName(newName))) throw new TypeError('invalid new service name');

		var found = false;
		for (var i = 0; i < globalServiceList.length; i++){
			if (globalServiceList[i].name == serviceName){
				globalServiceList[i].name = newName;
				fs.renameSync(path.join(keysFolder, serviceName), path.join(keysFolder, newName));
				saveConfig();
				found = true;
				break;
			}
		}
		return found;
	};

	this.addPorts = function(serviceName, ports, applyNow){
		if (!(typeof serviceName == 'string' && checkServiceName(serviceName))) throw new TypeError('invalid service name');
		if (!(typeof ports == 'string' || Array.isArray(ports))) throw new TypeError('invalid ports parameter');

		var found = false;
		for (var i = 0; i < globalServiceList.length; i++){
			if (globalServiceList[i].name == serviceName){
				if (Array.isArray(ports)){
					for (var j = 0; j < ports.length; j++){
						globalServiceList[i].ports.push(ports[j]);
					}
				} else globalServiceList[i].ports.push(ports);
				if (applyNow) saveConfig();
				found = true;
				break;
			}
		}
		return found;
	};

	this.removePorts = function(serviceName, ports, deleteIfEmptied, applyNow){
		if (!(typeof serviceName == 'string' && checkServiceName(serviceName))) throw new TypeError('invalid service name');
		if (!(ports && (typeof ports == 'string' || Array.isArray(ports)))) throw new TypeError('ports must either be a string or an array of strings');

		var found = false;
		for (var i = 0; i < globalServiceList.length; i++){
			if (globalServiceList[i].name == serviceName){
				if (Array.isArray(ports)){
					//Remove one by one all the ports in `ports` array
					for (var j = 0; j < ports.length; j++){
						for (var k = 0; k < globalServiceList[i].ports.length; k++){
							if (globalServiceList[i].ports[k] == ports[j]){
								globalServiceList[i].ports.splice(k, 1);
								found = true;
								break;
							}
						}
					}
				} else {
					//Remove the sole given port
					for (var k = 0; k < globalServiceList[i].ports.length; k++){
						if (globalServiceList[i].ports[k] == ports){
							globalServiceList[i].ports.splice(k, 1);
							found = true;
							break;
						}
					}
				}

				if (deleteIfEmptied && globalServiceList[i].ports.length == 0){
					this.removeHiddenService(serviceName, applyNow);
				}

				found = true;
				break;
			}
		}
		return found;
	};

	this.getOnionAddress = function(serviceName, cb){
		if (!(typeof serviceName == 'string' && checkServiceName(serviceName))) throw new TypeError('invalid service name');
		if (cb && typeof cb != 'function') throw new TypeError('when defined, cb must be a function');
		for (var i = 0; i < globalServiceList.length; i++){
			if (globalServiceList[i].name == serviceName){

				if (cb){
					watchOnion(serviceName, cb);
					return;
				}

				var fileReadCount = 0;
				while (fileReadCount < 3){
					try {
						return fs.readFileSync(path.join(keysFolder, serviceName, 'hostname')).toString('utf8').replace('\n', '');
					} catch (e){
						if (fileReadCount < 3) fileReadCount++;
						else throw e;
					}
				}
				break;
			}
		}
		if (torProcesses && torProcesses.length > 0){
			var e = new TypeError('Service name ' + serviceName + ' not found in config');
			if (cb) cb(e);
			else throw e;
		} else return undefined;
	};

	this.getServices = function(){
		var servicesCopy = [];
		for (var i = 0; i < globalServiceList.length; i++){
			var serviceObjectCopy = {};
			serviceObjectCopy.name = globalServiceList[i].name;
			serviceObjectCopy.ports = [];
			for (var j = 0; j < globalServiceList[i].ports.length; j++){
				serviceObjectCopy.ports.push(globalServiceList[i].ports[j]);
			}
			servicesCopy.push(serviceObjectCopy);
		}
		for (var i = 0; i < servicesCopy.length; i++){
			servicesCopy[i].hostname = this.getOnionAddress(servicesCopy[i].name);
		}
		return servicesCopy;
	};

	this.start = function(force, bootstrapCallback){
		if (bootstrapCallback && typeof bootstrapCallback != 'function') throw new TypeError('When defined, bootstrapCallback must be a function');

		socksDistribution = [];
		for (var i = 0; i < socks.length; i++){
			socksDistribution.push(socks[i]);
		}

		saveConfig();
		buildInstanceFolders(true, function(){
			torProcesses = [];
			var numProcesses = Math.ceil(globalServiceList.length / hsPerProcess);
			var processCount = 0;

			var torErrorHandler = torProcessOptionsObj ? torProcessOptionsObj.torErrorHandler : undefined;
			var torMessageHandler = torProcessOptionsObj ? torProcessOptionsObj.torMessageHandler : undefined;
			var torControlMessageHandler = torProcessOptionsObj ? torProcessOptionsObj.torControlMessageHandler : undefined;
			var torCommand = torProcessOptionsObj ? torProcessOptionsObj.torCommand : undefined;

			function spawnOne(){
				var socksPort;
				if (socksDistribution.length > 0){
					socksPort = socksDistribution[0];
					//socksDistribution.splice(0, 1);
					drawControlAndSpawn();
				} else {
					getRandomPort(function(err, _socksPort){
						if (err){
							if (bootstrapCallback){ bootstrapCallback(err); return; }
							else throw err;
						}
						socksPort = _socksPort;
						drawControlAndSpawn();
					});
				}

				function drawControlAndSpawn(){
					getRandomPort(function(err, controlPort){
						if (err){
							if (bootstrapCallback){ bootstrapCallback(err); return; }
							else throw err;
						}
						if (socksPort == controlPort){
							spawnOne();
							return;
						}

						if (socksDistribution.length > 0){
							//No need to redraw ports.
							//So we remove from the list the last one we drew
							socksDistribution.splice(0, 1);
						}

						var instanceFolder = path.join(torInstancesFolder, 'tor-' + (processCount + 1).toString());
						var torInstance = new ths(instanceFolder, socksPort, controlPort, torErrorHandler, torMessageHandler, torControlMessageHandler, path.join(process.cwd(), keysFolder));
						if (torCommand) torInstance.setTorCommand(torCommand);
						torInstance.start(true, function(){
							processCount++;
							torProcesses.push(torInstance);
							if (processCount >= numProcesses){
								processesRunning = true;
								queueInterval = setInterval(queueHandler, torProcessSpawnDelay);
								if (bootstrapCallback) bootstrapCallback();
							} else spawnOne();
						});
					});
				}
			}
			spawnOne();
		});
	}

	this.stop = function(callback){
		if (!(torProcesses && torProcesses.length > 0)) return;
		if (callback && typeof callback != 'function') throw new TypeError('When defined, callback must be a function');

		var processCount = torProcesses.length;

		function killOne(){
			processCount--;
			torProcesses[processCount].stop(function(){
				torProcesses.splice(processCount, 1);
				if (processCount == 0){
					torProcesses = null;
					processesRunning = false;
					clearInterval(queueInterval);
					if (callback) callback();
				} else killOne();
			});
		}
		killOne();
	};

	this.isTorRunning = function(){
		return processesRunning;
	};

	this.isOptimalPool = function(){
		return (!(torProcesses.length > Math.ceil(globalServiceList.length / hsPerProcess)));
	};

	this.torPid = function(){
		if (!processesRunning) return;
		var pids = [];
		for (var i = 0; i < torProcesses.length; i++){
			pids.push(torProcesses[i].torPid());
		}
		return pids;
	};

	this.socksPort = function(oneRandom){
		if (!processesRunning) return;
		if (oneRandom){
			var processIndex = Math.floor(Math.random() * torProcesses.length);
			return torProcesses[processIndex].socksPort();
		} else {
			var socks = [];
			for (var i = 0; i < torProcesses.length; i++){
				socks.push(torProcesses[i].socksPort());
			}
			return socks;
		}
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
		for (var i = 0; i < newBridges.length; i++) if (!parseBridgeLine(newBridges[i])) throw new TypeError('Invalid bridge line: ' + newBridges[i]);

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

	this.getTransports = function(transportName){
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

	//Builds the folder containing the config for all tor instances
	function buildInstanceFolders(deletePreviousData, callback){
		if (callback && typeof callback != 'function') throw new TypeError('When defined, callback must be a function');

		//Delete existing tor instance folder if existent. Create new tor instance folder (torInstancesFolder)
		if (deletePreviousData && fs.existsSync(torInstancesFolder)) {
			if (!fs.statSync(torInstancesFolder).isDirectory()) throw new TypeError('Error while building instances config files. Can\'t delete previous files');
			deleteFS(torInstancesFolder);
		}
		if (!fs.existsSync(torInstancesFolder)) fs.mkdirSync(torInstancesFolder);
		instanceServiceList = [];
		var processCounter = 0;
		while (processCounter * hsPerProcess < globalServiceList.length){
			var currentServiceList = [];
			var startServiceIndex = processCounter * hsPerProcess;
			var stopServiceIndex = (processCounter + 1) * hsPerProcess;
			for (var i = startServiceIndex, j = 0; i < stopServiceIndex && i < globalServiceList.length; i++, j++){
				currentServiceList[j] = {name: globalServiceList[i].name, ports: globalServiceList[i].ports};
			}
			//Create instance folder. Write config file
			var instanceFolderName = path.join(torInstancesFolder, 'tor-' + (processCounter + 1).toString());
			if (!fs.existsSync(instanceFolderName)) fs.mkdirSync(instanceFolderName);
			var thsDataFolderName = path.join(instanceFolderName, 'ths-data');
			if (!fs.existsSync(thsDataFolderName)) fs.mkdirSync(thsDataFolderName);
			var configFilePath = path.join(thsDataFolderName, 'ths.conf');
			fs.writeFileSync(configFilePath, JSON.stringify({services: currentServiceList, bridges: bridges, transports: transports}, null, '\t'));

			//Push the instance config
			instanceServiceList.push(currentServiceList);
			processCounter++;
		}
		if (callback) callback();

	}

	//Queue handler, called periodically to spawn a new tor instance that will host the newly added hidden services
	function queueHandler(){
		//Copy queue and clear it
		if (addQueue.length == 0) return; //Exit queue handling if the queue is empty. Saving time and some memory
		var currentQueue = [];
		for (var i = 0; i < addQueue.length; i++){
			currentQueue.push(addQueue[i]);
		}
		addQueue = [];
		//Count current instance folders. Create the one that should follow
		var folders = fs.readdirSync(torInstancesFolder);
		var newFolderName = path.join(torInstancesFolder, 'tor-' + (folders.length + 1).toString()); //Index + 1
		fs.mkdirSync(newFolderName);
		var thsDataFolderName = path.join(newFolderName, 'ths-data');
		fs.mkdirSync(thsDataFolderName);
		var configFilePath = path.join(thsDataFolderName, 'ths.conf');
		fs.writeFileSync(configFilePath, JSON.stringify({services: currentQueue, bridges: bridges, transports: transports}, null, '\t'));

		for (var i = 0; i < currentQueue.length; i++){
			globalServiceList.push(currentQueue[i]);
		}
		saveConfig();

		var spawnCount = 0;

		var torErrorHandler = torProcessOptionsObj ? torProcessOptionsObj.torErrorHandler : undefined;
		var torMessageHandler = torProcessOptionsObj ? torProcessOptionsObj.torMessageHandler : undefined;
		var torControlMessageHandler = torProcessOptionsObj ? torProcessOptionsObj.torControlMessageHandler : undefined;
		var torCommand = torProcessOptionsObj ? torProcessOptionsObj.torCommand : undefined;

		function spawnTor(){
			spawnCount++;
			if (spawnCount >= 10){
				//If errors happen 10 times in a row, stop spawning
				console.error('Queue mode deactivated in ths-pool. Please investigate the errors');
				return;
			}
			var socksPort;

			if (socksDistribution.length > 0){
				socksPort = socksDistribution[0];
				drawControlAndSpawn();
			} else {
				getRandomPort(function(err, _socksPort){
					if (err){
						console.error('Error while getting a random port: ' + err);
						spawnTor();
						return;
					}
					socksPort = _socksPort
					drawControlAndSpawn();
				});

			}

			function drawControlAndSpawn(){
				getRandomPort(function(err, controlPort){
					if (err){
						console.error('Error while getting a random port: ' + err);
						spawnTor();
						return;
					}
					if (socksPort == controlPort){
						spawnTor();
						return;
					}

					if (socksDistribution.length > 0){
						socksDistribution.splice(0, 1);
					}

					var torInstance = new ths(newFolderName, socksPort, controlPort, torErrorHandler, torMessageHandler, torControlMessageHandler, keysFolder);
					if (torCommand) torInstance.setTorCommand(torCommand);
					torInstance.start(true, function(){
						torProcesses.push(torInstance);
					});
				});
			}
		}
		spawnTor();
	}

};

function getRandomPort(callback){
	if (!(callback && typeof callback == 'function')) throw new TypeError('When defined, callback must be a function');

	var portTestCount = 0;
	var portTestMax = 5;

	var nextPort;
	var testServer = net.createServer();
	testServer.on('error', function(err){
		portTestCount++;
		if (portTestCount < portTestMax) isPortAvailable();
		else callback(err);
	});
	testServer.on('listening', function(){
		var availablePort = testServer.address().port;
		testServer.close(function(){
			callback(undefined, availablePort);
		});
	});
	function isPortAvailable(){
		nextPort = Math.floor(Math.random() * 49152) + 16384;
		testServer.listen(nextPort);
	}
	isPortAvailable();
}

function deleteFS(delPath){
	if (!fs.existsSync(delPath)) return;
	var stat = fs.statSync(delPath);
	if (stat.isFile()) fs.unlinkSync(delPath);
	else if (stat.isDirectory()){
		var folderContent = fs.readdirSync(delPath);
		for (var i = 0; i < folderContent.length; i++){
			deleteFS(path.join(delPath, folderContent[i]));
		}
		fs.rmdirSync(delPath);
	}
}
