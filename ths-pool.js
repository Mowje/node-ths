var ths = require('./index');
var fs = require('fs');
var net = require('net');

module.exports = function(globalConfigPath, keysFolder, torInstancesFolder, _hsPerProcess, torProcessOptionsObj){

	if (typeof globalConfigPath != 'string') throw new TypeError('globalConfigPath must be a string');
	if (typeof keysFolder != 'string') throw new TypeError('keysFolder must be a string');
	if (typeof torInstancesFolder != 'string') throw new TypeError('torInstancesFolder must be a string');
	if (_hsPerProcess && !(typeof _hsPerProcess == 'number' && _hsPerProcess > 0 && Math.floor(_hsPerProcess) == _hsPerProcess)) throw new TypeError('When defined, hsPerProcess must be a positive integer number');
	if (torProcessOptionsObj && typeof torProcessOptionsObj != 'object') throw new TypeError('when defined, torProcessOptionsObj')

	/*if (!(fs.existsSync(globalConfigPath) && fs.statSync(globalConfigPath).isFile())){

	}*/

	var globalServiceList = [];
	var torProcesses = [];
	var hsPerProcess = _hsPerProcess || 2500;

	function loadConfig(){
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
		if (fs.existsSync(globalConfigPath)) fs.unlinkSync(globalConfigPath);
		fs.writeFileSync(globalConfigPath, JSON.stringify(globalServiceList));
		// Anything in addition regarding the tor child processes?
	}

	this.saveConfig = saveConfig;

	this.start = function(force, bootstrapCallback){

	}

	function buildInstanceFolders(callback){
		if (callback && typeof callback != 'function') throw new TypeError('When defined, callback must be a function');

		

		var processCounter = 0;
		while (processCounter * hsPerProcess < globalServiceList.length){
			var currentServiceList = [];
			var startServiceIndex = processCounter * hsPerProcess;
			var stopServiceIndex = (processCount + 1) * hsPerProcess;
			for (var i = startServiceIndex; i < stopServiceIndex && i < globalServiceList.length; i++){

			}

			processCounter++;
		}

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
