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

	};

	this.removeHiddenService = function(serviceName, applyNow){

	};

	this.rename = function(serviceName, newName){

	};

	this.addPorts = function(serviceName, ports, applyNow){

	};

	this.removePorts = function(serviceName, ports, deleteIfEmptied, applyNow){

	};

	this.getOnionAddress = function(){

	};

	this.getServices = function(){

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
