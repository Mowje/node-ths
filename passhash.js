var spawn = require('child_process').spawn;

module.exports = function(length, callback, cmd){
	if (!(typeof length == 'number' && length > 0)) throw new TypeError('length must be a strictly positive number');
	if (!(typeof callback == 'function')) throw new TypeError('callback must be a function');

	var textGenerator = function(length){
		if (typeof length != 'number') throw new TypeError('length must be a number');
		var charset = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
		var result = "";
		var charIndex;
		for(var i = 0; i < length; i++){
			charIndex = Math.floor(Math.random() * charset.length);
			result += charset.charAt(charIndex);
		}
		return result;
	};

	function getPasswordHash(pass, callback){
		var output = '';
		var torProcess = spawn(cmd || 'tor', ['--hash-password', pass]);
		torProcess.stdout.on('data', function(data){
			output += data;
		});
		torProcess.on('close', function(){
			output = output.split('\n');
			var hash;
			for (var i = output.length - 1; i > 0; i--){
				if (output[i] && output[i] != ""){
					hash = output[i];
					break;
				}
			}
			callback(pass, hash);
		});
	}

	//Generates a random password, then hashes it. Calls callback (pass, hash);
	getPasswordHash(textGenerator(length), callback);
};
