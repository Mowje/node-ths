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
	}

	var checkServiceName = function(serviceName){
		var regexCheck = /^[a-zA-Z0-9-_]+$/;
		return regexCheck.test(serviceName);
	};

	/*if (!(fs.existsSync(globalConfigPath) && fs.statSync(globalConfigPath).isFile())){

	}*/

	var globalServiceList = [];
	var instanceServiceList = [];
	var torProcesses = [];
	var hsPerProcess = _hsPerProcess || 2500;
	var processesRunning = false;

	var queueInterval;
	var addQueue = [];

	function loadConfig(){
		if (!(fs.existsSync(globalConfigPath) && fs.statSync(globalConfigPath).isFile())) throw new TypeError('Error while loading config file. Either the path/file doesn\'t exist, or the path isn\'t a file');
		var configLoadObj;
		var configText;
		try {
			configText = fs.readFileSync(globalConfigPath);
			configLoadObj = JSON.parse(configText);
		} catch (e){
			return false;
		}
		if (!Array.isArray(configLoadObj)) throw new TypeError('service config file must be a JSON array containing hidden services details');
		globalServiceList = [];
		for (var i = 0; i < configLoadObj.length; i++){
			if (configLoadObj[i].name && configLoadObj[i].ports && Array.isArray(configLoadObj[i].ports)){
				globalServiceList.push({name: configLoadObj[i].name, ports: configLoadObj[i].ports});
			}
		}
		return true;
	}

	this.loadConfig = loadConfig;

	function saveConfig(){
		if (fs.existsSync(globalConfigPath)) {
			if (!fs.statSync(globalConfigPath).isFile()) throw new TypeError('Error while saving config file. Either the given path/file doesn\'t exists, or the path isn\'t a directory');
			fs.unlinkSync(globalConfigPath);
		}
		fs.writeFileSync(globalConfigPath, JSON.stringify(globalServiceList, null, '\t'));
		// Anything in addition regarding the tor child processes?
	}

	this.saveConfig = saveConfig;

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

	this.getOnionAddress = function(serviceName){
		if (typeof serviceName == 'string' && checkServiceName(serviceName)) throw new TypeError('invalid service name');
		for (var i = 0; i < globalServiceList.length; i++){
			if (globalServiceList[i].name == serviceName){
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
		if (torProcesses && torProcesses.length > 0) throw new TypeError('Service name ' + serviceName + ' not found in config');
		else return undefined;
	};

	this.getServices = function(){
		var servicesCopy = [];
		for (var i = 0; i < globalServiceList.length; i++){
			var serviceObjectCopy = {};
			serviceObjectCopy.name = services[i].name;
			serviceObjectCopy.ports = [];
			for (var j = 0; j < globalServiceList[i].ports.length; j++){
				serviceObjectCopy.push(globalServiceList[i].ports[j]);
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
		buildInstanceFolders(true, function(){
			torProcesses = [];
			var numProcesses = Math.ceil(globalServiceList.length / hsPerProcess);
			var processCount = 0;

			var torErrorHandler = torProcessOptionsObj ? torProcessOptionsObj.torErrorHandler : undefined;
			var torMessageHandler = torProcessOptionsObj ? torProcessOptionsObj.torMessageHandler : undefined;
			var torControlMessageHandler = torProcessOptionsObj ? torProcessOptionsObj.torControlMessageHandler : undefined;
			var torCommand = torProcessOptionsObj ? torProcessOptionsObj.torCommand : undefined;

			function spawnOne(){
				getRandomPort(function(err, socksPort){
					if (err){
						if (bootstrapCallback){ bootstrapCallback(err); return; }
						else throw err;
					}
					getRandomPort(function(err, controlPort){
						if (err){
							if (bootstrapCallback){ bootstrapCallback(err); return; }
							else throw err;
						}
						if (socksPort == controlPort){
							spawnOne();
							return;
						}

						var instanceFolder = path.join(torInstancesFolder, 'tor-' + (processCount + 1).toString());
						var torInstance = new ths(instanceFolder, socksPort, controlPort, torErrorHandler, torMessageHandler, torControlMessageHandler, keysFolder);
						if (torCommand) torInstance.setTorCommand(torCommand);
						torInstance.start(true, function(){
							processCount++;
							torProcesses.push(torInstance);
							if (processCount == numProcesses){
								processesRunning = true;
								queueInterval = setInterval(queueHandler, _torProcessSpawnDelay);
								if (bootstrapCallback) bootstrapCallback();
							} else spawnOne();
						});
					});
				});
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
	}

	this.torPid = function(){
		if (!processesRunning) return;
		var pids = [];
		for (var i = 0; i < torProcesses.length; i++){
			pids.push(torProcesses[i].torPid());
		}
		return pids;
	};

	this.socksPort = function(){
		if (!processesRunning) return;
		var socks = [];
		for (var i = 0; i < torProcesses.length; i++){
			socks.push(torProcesses[i].socksPort());
		}
		return socks;
	};

	function buildInstanceFolders(deletePreviousData, callback){
		if (callback && typeof callback != 'function') throw new TypeError('When defined, callback must be a function');

		//Delete existing tor instance folder if existent. Create new tor instance folder (torInstancesFolder)
		if (deletePreviousData && fs.existsSync(torInstancesFolder)) {
			if (!fs.statSync(torInstancesFolder).isDirectory()) throw new TypeError('Error while building instances config files. Can\'t delete previous files');
			fs.rmdirSync(torInstancesFolder);
		}
		if (!fs.existsSync(torInstancesFolder)) fs.mkdirSync(torInstancesFolder);
		instanceServiceList = [];
		var processCounter = 0;
		while (processCounter * hsPerProcess <= globalServiceList.length){
			var currentServiceList = [];
			var startServiceIndex = processCounter * hsPerProcess;
			var stopServiceIndex = (processCounter + 1) * hsPerProcess;
			for (var i = startServiceIndex, j = 0; i < stopServiceIndex && i < globalServiceList.length; i++, j++){
				currentServiceList[j] = {name: globalServiceList[i].name, ports: globalServiceList[i].ports};
			}
			//Create instance folder. Write config file
			var instanceFolderName = path.join(torInstancesFolder, 'tor-' + (processCounter + 1).toString());
			if (!fs.existsSync(instanceFolderName)) fs.mkdirSync(instanceFolderName);
			var configFilePath = path.join(instanceFolderName, 'ths.conf');
			fs.writeFileSync(configFilePath, JSON.stringify(currentServiceList, null, '\t'));

			//Push the instance config
			instanceServiceList.push(currentServiceList);
			processCounter++;
		}

		if (callback) callback();

	}

	function queueHandler(){
		//Copy queue and clear it
		var currentQueue = [];
		for (var i = 0; i < addQueue.length; i++){
			currentQueue.push(addQueue[i]);
		}
		addQueue = [];
		//Count current instance folders. Create the one that should follow
		var folders = fs.readdirSync(torInstancesFolder);
		var newFolderName = path.join(torInstancesFolder, 'tor-' + folder.length.toString()); //Index + 1
		fs.mkdirSync(newFolderName);
		var configFilePath = path.join(newFolderName, 'ths.conf');
		fs.writeFileSync(configFilePath, JSON.stringify(currentQueue, null, '\t'));

		for (var i = 0; i < currentQueue.length; i++){
			globalServiceList.push(currentQueue[i]);
		}
		saveConfig();

		var spawnCount = 0;

		function spawnTor(){
			spawnCount++;
			if (spawnCount >= 10){
				//If errors happen 10 times in a row, stop spawning
				console.error('Queue mode deactivated in ths-pool. Please investigate the errors');
				return;
			}
			getRandomPort(function(err, socksPort){
				if (err){
					console.error('Error while getting a random port: ' + err);
					spawnTor();
					return;
				}
				getRandomPort(function(err, controlPort){
					if (err){
						console.error('Error while getting a random port: ' + err);
						spawnTor();
						return;
					}
				});
				if (socksPort == controlPort){
					spawnTor();
					return;
				}

				var torErrorHandler = torProcessOptionsObj ? torProcessOptionsObj.torErrorHandler : undefined;
				var torMessageHandler = torProcessOptionsObj ? torProcessOptionsObj.torMessageHandler : undefined;
				var torControlMessageHandler = torProcessOptionsObj ? torProcessOptionsObj.torControlMessageHandler : undefined;
				var torCommand = torProcessOptionsObj ? torProcessOptionsObj.torCommand : undefined;

				var torInstance = new ths(newFolderName, socksPort, controlPort, torErrorHandler, torMessageHandler, torControlMessageHandler, keysFolder);
				if (torCommand) torInstance.setTorCommand(torCommand);
				torInstance.start(true, function(){
					torProcesses.push(torInstance);
				});
			});
		}
		spawnTor();
	}

	return this;
};

function getRandomPort(callback){
	if (!(callback && typeof callback == 'function')) throw new TypeError('When defined, callback must be a function');

	var nextPort;
	var testServer = net.createServer();
	testServer.on('error', function(){
		isPortAvailable();
	});
	testServer.on('listening', function(){
		var availablePort = testServer.address().port;
		testServer.close(function(){
			callback(availablePort);
		});
	});
	function isPortAvailable(){
		nextPort = Math.round(Math.random() * 32768) + 32767;
		testServer.listen(nextPort);
	}
	isPortAvailable();
}
