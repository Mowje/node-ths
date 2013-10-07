module.exports = function(thsFolder, socksPortNumber, showTorMessages){
	var spawn = require('child_process').spawn;
	var fs = require('fs');
	var os = require('os');
	//var util = require('util');

	var fseperator = (os.platform().indexOf('win') == 0) ? '\\' : '/'; //Selects the right path seperator correpsonding to the OS platform

	var torProcess;

	var checkServiceName = function(serviceName){
		var regexCheck = /^[a-zA-Z0-9-_]+$/;
		return regexCheck.test(serviceName);
	};

	var loadConfig = function(){
		var configLoadObj;
		var configText
		try {
			configText = fs.readFileSync(configFilePath);
			configLoadObj = JSON.parse(configText);
		} catch (e) {
			//console.log('Error on THS config load\n' + e);
			return false;
		}
		if (!Array.isArray(configLoadObj)) throw new TypeError('config file must be a JSON array containing hidden services details');
		services = [];
		for (var i = 0; i < configLoadObj.length; i++){
			if (configLoadObj[i].name && configLoadObj[i].ports && Array.isArray(configLoadObj[i].ports)){
				services.push({name: configLoadObj[i].name, ports: configLoadObj[i].ports});
			}
		}
		return true;
	};

	var portNumber = (socksPortNumber || 9999).toString();
	var showTorLogs = showTorMessages;
	var services = [];

	//Path to folder that will contain the config file and hidden services' keys
	var baseFolder = thsFolder || process.cwd();
	if (baseFolder && !(baseFolder.lastIndexOf(fseperator) == baseFolder.length - 1)) baseFolder += fseperator; //Adding the path seperator if necessary
	baseFolder += 'ths-data' + fseperator;
	if (!fs.existsSync(baseFolder)) fs.mkdirSync(baseFolder); //Creating the folder if it doesn't exist
	//Path to config file, inside baseFolder
	var configFilePath =  baseFolder + 'ths.conf';
	if (fs.existsSync(configFilePath)) loadConfig();
	//Path to DataDirectory folder, necessary for the tor process. Note that each instance must have its own DataDirectory folder, seperate from other instances
	var torDataDir  = baseFolder + 'torData' + fseperator;
	if (!fs.existsSync(torDataDir)) fs.mkdirSync(torDataDir); //Creating the DataDirectory if it doesn't exist

	var buildParamArray = function(){
		var params = [];
		params.push('--DataDirectory');
		params.push(torDataDir);
		params.push('--SocksPort');
		params.push(portNumber);
		for (var i = 0; i < services.length; i++){
			params.push('--HiddenServiceDir');
			params.push(baseFolder + services[i].name);
			for (var j = 0; j < services[i].ports.length; j++){
				params.push('--HiddenServicePort');
				params.push(services[i].ports[j]);
			}
		}
		return params;
	};

	this.loadConfig = loadConfig;

	this.saveConfig = function(){
		if (fs.existsSync(configFilePath)) fs.unlinkSync(configFilePath); //Overwriting didn't seem to work. Hence I delete the file (if it exists) before writing the new config
		fs.writeFileSync(configFilePath, JSON.stringify(services));
	};

	this.createHiddenService = function(serviceName, ports, startTor, force, bootstrapCallback){
		if (!(ports && serviceName)) throw new TypeError('Missing parameters');
		if (!checkServiceName(serviceName)) throw new TypeError('Invalid service name. It should only contain letters, digits, hyphens and underscore (no spaces allowed)');
		//Checking that the service name isn't already taken
		for (var i = 0; i < services.length; i++){
			if (services[i].name == serviceName){
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
		services.push(service);
		if (startTor){
			this.start(force, bootstrapCallback);
		}
	};

	this.removeHiddenService = function(serviceName, startTor, force, bootstrapCallback){
		if (!checkServiceName(serviceName)) throw new TypeError('Invalid service name. It should only contain letters, digits, hyphens and underscore (no spaces allowed)');
		for (var i = 0; i < services.length; i++){
			if (services[i].name == serviceName) {
				services.splice(i, 1);
				var containedFiles = fs.readdirSync(baseFolder + serviceName);
				for (var j = 0; j < containedFiles.length; j++){
					fs.unlinkSync(baseFolder + serviceName + fseperator + containedFiles[j]);
				}
				fs.rmdirSync(baseFolder + serviceName);
				if (startTor){
					this.start(force, bootstrapCallback);
				}
			}
		}
	};

	this.addPorts = function(serviceName, ports, startTor, force, bootstrapCallback){
		if (!serviceName) throw new TypeError('Service name can\'t be null');
		if (!checkServiceName(serviceName)) throw new TypeError('Invalid service name. It should only contain letters, digits, hyphens and underscore (no spaces allowed)');
		for (var i = 0; i < services.length; i++){
			if (services[i].name == serviceName){
				if (Array.isArray(ports)){
					for (var j = 0; j < ports.length; j++){
						services[i].ports.push(ports[j]);
					}
				} else services[i].ports.push(ports);
				if (startTor) this.start(force, bootstrapCallback);
				return;
			}
		}
		throw new TypeError('Service ' + serviceName + ' not found');
	};

	this.removePorts = function(serviceName, ports, deleteIfEmptied, startTor, force, bootstrapCallback){
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
					for (var k = 0; k < services[i].ports; k++){
						if (services[i].ports[k] == ports){
							services[i].ports.splice(k, 1);
							break;
						}
					}
				}
				if (deleteIfEmptied && services[i].ports.length == 0){
					this.removeHiddenService(serviceName);
				}
				if (startTor){
					this.start(force, bootstrapCallback);
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
				while (fileReadCount < 3){
					try {
						return fs.readFileSync(baseFolder + serviceName + '/hostname').toString('utf8').replace('\n', '');
					} catch (e){
						if (fileReadCount < 3) fileReadCount++;
						else throw e;
					}
				}
			}
		}
		throw new TypeError('Service name ' + serviceName + ' not found in config');
	};

	this.getServices = function(){
		var servicesCopy = services;
		for (var i = 0; i < servicesCopy.length; i++){
			servicesCopy[i].hostname = this.getOnionAddress(servicesCopy[i].name);
		}
		return servicesCopy;
	};

	this.start = function(force, bootstrapCallback){
		if (!services || services.length == 0) throw new TypeError('Please load the config before calling the start() method');
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
			var torParams = buildParamArray();
			torProcess = spawn('tor', torParams);
			torProcess.stderr.on('data', function(data){
				console.log('Error from child tor process:\n' + data.toString('utf8'));
			});
			if (bootstrapCallback && typeof bootstrapCallback == 'function'){
				torProcess.stdout.on('data', function(data){
					if (showTorLogs) console.log(data.toString('utf8'));
					if (data.toString('utf8').indexOf('Bootstrapped 100%: Done') > -1) bootstrapCallback();
				});
			} else {
				if (showTorLogs){
					torProcess.stdout.on('data', function(){
						console.log(data.toString('utf8'));
					});
				}
			}
			console.log("Tor process PID : " + torProcess.pid);
		}
	};

	this.stop = function(callback){
		if (!torProcess) {
			//throw new TypeError('Error on stop() : No tor process is running');
			return;
		}
		if (callback && typeof callback == 'function') {
			torProcess.on('close', function(){
				callback();
			});
		}
		torProcess.kill();
		torProcess = undefined;
	};

	this.isTorRunning = function(){
		return !(typeof torProcess === 'undefined');
	};

	//Sets node exit event handler, to kill the tor process if running
	process.on('exit', function(){
		if (torProcess){
			console.log('Killing the Tor child process');
			torProcess.kill();
			torProcess = undefined;
		}
	});

	//Return the newly constructed ths instance
	return this;
};