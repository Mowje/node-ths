# node-ths [![NPM version](https://badge.fury.io/js/ths.svg)](http://badge.fury.io/js/ths)


node-ths (node - Tor Hidden Services) is a node.js module allowing you to create and manage [Tor hidden services](https://www.torproject.org/docs/hidden-services) from your app, as well as simply starting a Tor instance.

## Overview

Part of a bigger project, I needed to be able to to create and manage programmatically Tor Hidden Services from a Node.js application.

With this module, you can :

* Start a tor instance. Can use bridges and pluggable transports
* Create and delete hidden services
* Adding and removing port bindings to existing hidden services
* Have a pool of tor instances that have all of these features

When you start this module, it runs a dedicated instance of Tor. It writes a dedicated torrc file. Whenever you change a setting, the torrc file is update and the config is reload through a signal sent on the tor control port.

## Requirements

* [Node.js](http://nodejs.org)
* [Tor](https://torproject.org), installed so that it could be called from terminal/command line by running a simple ```tor``` command

## Installation

Simply run

	npm install ths

from your app's folder to install the module

## Usage

_Preliminary notes_ :

* Whenever you modify a setting, the new config isn't written. You have to explicitly call the ```saveConfig()``` method or set `applyNow = true` in methods that allow this parameter. Changes are applied without restarting the tor instance.
* To escape an optional parameter and define a parameter that follows, set it to `undefined`
* ~~If you add or remove a hidden service (and apply the modification) while Tor is running, it won't affect the uptime of the other hosted hidden services. Note that this detail is "Tor-specific" and not linked to this module (but I thought it's an interesting thing to know if you're going to host hidden services).~~
* As of now, if you add/remove a hidden service (and apply the modification) while Tor is running, **all** other hidden services will be unvailable for a while (Tor is rebuilding circuits and re-announcing the hidden services on the network, duration depends on how much hidden services you're hosting). I'm looking for ways to add/remove hidden services without affecting other hidden services. Looking again into the Tor control protocol

__ths([thsFolder], [socksPortNumber], [controlPortNumber], [torErrorHandler], [torMessageHandler], [torControlMessageHandler], [keysFolder])__ :

Constructor of a node-ths module instance. Note that this constructor calls the ```loadConfig()``` method.

* thsFolder : the folder that will contain the ths-data folder. ths.conf file and the hidden services' keys and hostname files. Also, this is where the tor "DataDirectory" is found(necessary and unique for each tor instance). This parameter defaults to "/path/to/your/app/ths-data"
* socksPortNumber : the SOCKS server port that the underlying tor instance will use. Defaults to port 9999
* controlPortNumber : the Tor control port number. Used to force the process to reload the config without restarting. Defaults to 9998.
* torErrorHandler: a function that will receive Tor's warnings and error messages (one paramater, as a string). Optional. Not used by default.
* torMessageHandler : a function that will receive standard Tor info messages (one parameter, as a string). Optional. Not used by default.
* torControlMessageHandler : a function that will receive the control messages coming from the control port of the Tor process (one parameter, as a string). Optional. Not used by default.
* keysFolder : a string, a path to the folder where hidden service keys are stored. Optional. Default is thsFolder/ths-data/keys

*Example :*

	var thsBuilder = require('ths');
	var ths = new thsBuilder(__dirname);

__ths.start([force], [callback])__ :

Starts the tor instance.

* force : a boolean determining whether a running tor instance should be killed and run a new one or not. Defaults to false.
* callback : a callback function called when the tor instance is started and bootstrapped

__ths.stop([callback])__ :

Stops a running tor instance. Does nothing if no tor instance is running.

* callback : a callback function, called right after the tor process is killed

__ths.isTorRunning()__ :

Returns a boolean, true if the underlying tor instance is running; false if it isn't

__ths.createHiddenService(serviceName, ports, [applyNow])__ :

Creates a new tor hidden service :

* serviceName : a "human-readable" name for the service. This service's identifier for the node-ths module. It will be asked by some other methods. This name is restricted to alphanumerical chars, hyphens and underscores (no spaces)
* [port] : Port string or array of port strings. These strings must have the same format/syntax as for a "HiddenServicePort" in a usual torrc config file. This is how it works (harvested from the tor man page) :
```
HiddenServicePort VIRTPORT [TARGET]
Configure a virtual port VIRTPORT for a hidden service. You may use this option multiple times; each time applies to the service using the most recent hiddenservicedir. By default, this option maps the virtual port to the same port on 127.0.0.1 over TCP. You may override the target port, address, or both by specifying a target of addr, port, or addr:port. You may also have multiple lines with the same VIRTPORT: when a user connects to that VIRTPORT, one of the TARGETs from those lines will be chosen at random.
```
* applyNow : writes the new config on the disk and (if tor is running) sends a 'reload config' signal to the process. Defaults to false.

__ths.removeHiddenService(serviceName, [applyNow])__ :

Removes the hidden service with the given serviceName

* serviceName : name of the hidden service to be removed
* applyNow : writes the new config on the disk and (if tor is running) sends a 'reload config' signal to the process. Defaults to false.

__ths.rename(serviceName, newName)__ :

Renames the hidden service. Saves the new config on disk.

__ths.addPorts(serviceName, ports, [applyNow])__ :

Add ports bindings to an existing hidden service

* serviceName : the name of the service to which we'll add the ports
* ports : ports entry or array of port entries to be added
* applyNow : writes the new config on the disk and (if tor is running) sends a 'reload config' signal to the process. Defaults to false.

__ths.removePorts(serviceName, ports, [deleteIfEmptied], [applyNow])__ :

Removes the given ports from the given service

* serviceName : the name of the service from which we'll remove the ports
* ports : ports entry or array of port entries to be removed
* deleteIfEmptied : a boolean, determining whether the hidden service should be deleted if there are no more ports entry in it. Defaults to false.
* applyNow : writes the new config on the disk and (if tor is running) sends a 'reload config' signal to the process. Defaults to false.

__ths.getServices()__ :

Returns the service list

__ths.getOnionAddress(serviceNamec, [callback])__ :

Returns the .onion hostname for the given service

* serviceName : name of the service you are looking for
* callback : optional callback. Receives (err, hostname). If used, the callback is only invoked once the onion address exists. (ie, it retries until it succeeds)

__ths.torPid()__ :

Returns the PID of the current Tor process, if it exists.

__ths.socksPort([oneRandom])__ :

Returns the SOCKS port number Tor process is running on.

* oneRandom : A boolean determining whether a single random available SOCKS port should be returned, or the entire list (default). Optional parameter. Defaults to false.

__ths.controlPass()__ :

Returns the password you would need to connect an use the current instance's control port

__ths.getTorCommand()__ :

Returns the command that is used by this module in order to spawn Tor. (Default is "tor")

__ths.setTorCommand(torCommand)__ :

Set the command that will be used to spawn a Tor process. Useful if Tor is not in your $PATH and/or you want to indicate where your Tor executable is. Default is "tor" (as written above).

__ths.loadConfig()__ :

(Re)loads the config file. This method is invoked when a ths instance is constructed.

__ths.saveConfig()__ :

Saves the config. Must be called when changes are made to the config (service addition/deletion, ports addition/deletion)

__ths.addBridge(bridgeLine, save)__ :

Add a bridge to be used as a client. Returns true if the bridgeLine is correctly formated, false otherwise
* bridgeLine : a string, built as described in the tor man page for the Bridge parameter in the torrc file:
```
[transport] IP:ORPort [fingerprint]
```
* save : a boolean, determining whether the new config should be written now on disk or not

__ths.removeBridge(bridgeAddress, save)__ :

Remove a bridge given its `IP:ORPort`. Returns true if the bridge has been removed, false otherwise
* bridgeAddress: a string, containing the IP and Tor relay port seperated by a colon ("1.2.3.4:443", for example)
* save : a boolean, determining whether the new config should be saved on disk now or not

__ths.setBridges(bridgeLineArray)__ :

Set the list of bridges to be used by the Tor instance. Throws an exception if one of the bridge lines is invalid. Writes the new config to disk

__ths.getBridges()__ :

Returns the array of bridge parameters that are used by the instance

__ths.clearBridges()__ :

Clear the list of bridges. Equals to `ths.setBridges([])`

__ths.addTransport(transportLine, save)__ :
Add a pluggable transport to be used with bridges
* transportLine : string, built as described in the tor man page for the ClientTransportPlugin parameter in the torrc file
```
transportName exec pathToBinary arg1 arg2 ...
```
or
```
transportName socks4|socks5 ip:port
```
* save : a boolean, determining whether the new config should be saved on disk now or not

__ths.removeTransport(transportName, save)__ :
Remove a pluggable transport config based on its name. Returns true if it was successfully removed, false otherwise
* transportName : a string, containing the name of the pluggable transport as used at its addition
* save : a boolean, determining whether the new config should be saved on disk now or not

__ths.setTransports(transportsArray)__ :
Set the pluggable transports to be used by the Tor instance. Writes the new config to disk
* transportsArray : Array<String> containing transportLines, as in `addTransport()`. The method throws an exception if one the tranportLines is invalid.

__ths.getTransports()__ :
Return a list of the configured pluggable transports, as an array of transportLines


## Tor process pooling

I was looking for ways to add Hidden Services dynamically, while Tor is running, without affecting the other hidden services.

After re-reading the control protocoll, retrying different things with it and reading the Tor sources that manage the "RELOAD" signal, the only way I've found to add Hidden Services dynnmically without affecting the existing ones is to spawn other Tor processes that will handle the new hidden services to be added. Hence, it will be more practical to have a module that will do the multi-process management for us

The THS pool will have a central config file that will contain all the port binding for each hidden service. When starting the pool, there is a threshold of Hidden Services that could be managed by a single Tor process; the module then spawn as many Tor processes as needed to "split equally the main config". After that the pool has been started, hidden services to be created are added to a temporary list that will be processed at a fixed frequency

### Usage :

Aside the constructor, the exposed API doesn't change much from the normal THS module (that is described above).
To escape an optional parameter (in order to set a parameter that follows, for example) set it to `undefined`

The THS process pool is implemented in `ths-pool.js`. So here is how we "instanciate" a pool:

	var ths_pool_builder = require('ths/ths-pool');
	var ths_pool = new ths_pool_builder([args]);

Here is the list of available methods:

__ths_pool(mainConfigFile, keysFolder, torInstancesFolder, [hsPerProcess], [spawnDelay], [torProcessOptions])__ :

* mainConfigFile : path to the main config file. If inexistant it will be created when saving the config, or starting up the process pool
* keysFolder : folder that (will) contain the hidden service key files. This folder will actually contain one folder per hidden service, and inside each of these folder there will be the `hostname` and `private_key` files
* torInstancesFolder : folder that will contain the `ths-data` folders for each Tor process instance
* hsPerProcess : maximum number of hidden services per Tor process. Optional. Defaults to 2500
* spawnDelay : in milliseconds, interval at which a new Tor process is spawned with the new hidden services to be created. Optional. Defaults to 600000 milliseconds (= 10 minutes)
* torProcessOptions : optional object containing the different options to be passed to the underlying THS instances :
	* torErrorHandler : function that will receive Tor error messages (from `stderr`)
	* torMessageHandler : function that will receive Tor console messages (from `stdout`)
	* torControlMessageHandler : function that will receive the control messages sent from the Tor process (through the control port)
	* torCommand : the command/relative path to be called when spawning the Tor process. Used to override a global `tor` command
	* socksPort : Number or array of numbers. Preferred SOCKS port(s) for the pool's instances

__ths_pool.start([force], [callback])__ :

Read the config, splits it and start the Tor process pool

* force : stops a running pool before restarting it. Boolean. Optional. Defaults to false.
* callback : optional callback function, called when all Tor processes have bootstrapped

__ths_pool.stop([callback])__ :

Stops a running Tor process pool

* callback : optional callback function to be called when all Tor processes have been stopped

__ths_pool.isTorRunning()__ :

Returns a boolean indicating whether the process pool is running or not

__ths_pool.isOptimalPool()__ :

Returns whether the pool is optimal. If it isn't, restarting the pool will make it optimal again (Hidden Services will be re-splitted across a lower number of processes)

__ths_pool.createHiddenService(serviceName, ports, [saveNow])__ :

Creates a new tor hidden service :

* serviceName : a "human-readable" name for the service. This service's identifier for the node-ths module. It will be asked by some other methods. This name is restricted to alphanumerical chars, hyphens and underscores (no spaces)
* [port] : Port string or array of port strings. These strings must have the same format/syntax as for a "HiddenServicePort" in a usual torrc config file. This is how it works (harvested from the tor man page) :
```
HiddenServicePort VIRTPORT [TARGET]
Configure a virtual port VIRTPORT for a hidden service. You may use this option multiple times; each time applies to the service using the most recent hiddenservicedir. By default, this option maps the virtual port to the same port on 127.0.0.1 over TCP. You may override the target port, address, or both by specifying a target of addr, port, or addr:port. You may also have multiple lines with the same VIRTPORT: when a user connects to that VIRTPORT, one of the TARGETs from those lines will be chosen at random.
```
* saveNow : writes the new config on the disk and (if the pool is running) adds the new hidden service to creation queue. The hidden service will be created when a new Tor instance is spawned (afterSpawn delay)

__ths_pool.removeHiddenService(serviceName, [saveNow])__ :

Remove an existing hidden service given it's `serviceName`. Note that this can take effect only when restarting the process pool

* serviceName : the unique name of the service to be deleted
* saveNow : boolean. if true, save the updated config. Defaults to `false`

__ths_pool.rename(serviceName, newName)__ :

Renames the hidden service. Writes the new config on disk

__ths_pool.addPorts(serviceName, ports, [saveNow])__ :

Add port(s) to an existing hidden service. Takes effect when the process pool is restarted

* serviceName : the service's name
* ports : port string or array of port strings (as described for `createHiddenService`)
* saveNow : boolean. if true, save the updated config. Defaults to `false`

__ths_pool.removePorts(serviceName, ports, [deleteIfEmptied], [saveNow])__ :

Remove ports from an existing hidden service. Takes effect when the process pool is restarted

* serviceName : the service's name
* ports : port string or array of the port strings to be removed
* deleteIfEmptied : a boolean, determining whether the hidden service should be deleted if there are no more ports entry in it. Defaults to false.
* saveNow : boolean. if true, save the updated config. Defaults to `false`

__ths_pool.getServices()__ :

Get the list of running services, with their `name` and array of `ports`

__ths_pool.getOnionAddress(serviceName, [callback])__ :

Get the onion address of an existing hidden service, given it's serviceName. Note that this method might return `undefined` even though the hidden service exists (but hasn't been "started" for the first time yet)

* serviceName : name of the service you're looking for
* callback : optional callback. Receives (err, hostname). If used, the callback is only invoked once the onion address exists. (ie, it retries until it succeeds)

__ths_pool.torPid()__ :

Get the list of Tor processes PIDs. Returns `undefined` if the pool isn't running.

__ths_pool.socksPort()__ :

Get the list of open SOCKS server ports from the running Tor process pool.

__ths_pool.addBridge(bridgeLine, save)__ :

Add a bridge to be used as a client. Returns true if the bridgeLine is correctly formated, false otherwise

* bridgeLine : a string, built as described in the tor man page for the Bridge parameter in the torrc file:
```
[transport] IP:ORPort [fingerprint]
```
* save : a boolean, determining whether the new config is saved on disk at the end of the method or not

__ths_pool.removeBridge(bridgeAddress, save)__ :

Remove a bridge given its `IP:ORPort`. Returns true if the bridge has been removed, false otherwise
* bridgeAddress: a string, containing the IP and Tor relay port seperated by a colon ("1.2.3.4:443", for example)
* save : a boolean, determining whether the new config should be saved on disk now or not

__ths_pool.setBridges(bridgeLineArray)__ :

Set the list of bridges to be used by the Tor pool's instances. Throws an exception if one of the bridge lines is invalid. Saves the new config to disk

__ths_pool.getBridges()__ :

Returns the array of bridge parameters that are used by the pool's instances

__ths_pool.clearBridges()__ :

Clear the list of bridges. Equals to `ths_pool.setBridges([])`

__ths_pool.addTransport(transportLine, save)__ :
Add a pluggable transport to be used with bridges
* transportLine : string, built as described in the tor man page for the ClientTransportPlugin parameter in the torrc file
```
transportName exec pathToBinary arg1 arg2 ...
```
or
```
transportName socks4|socks5 ip:port
```
* save : a boolean, determining whether the new config should be written now on disk or not

__ths_pool.removeTransport(transportName, save)__ :
Remove a pluggable transport config based on its name. Returns true if it was successfully removed, false otherwise
* transportName: a string, containing the transport's name
* save : a boolean, determining whether the new config should be written now on disk or not

__ths_pool.setTransports(transportsArray)__ :
Set the pluggable transports to be used by the pool's instances. Writes the new config to disk
* transportsArray : Array<String> containing transportLines, as in `addTransport()`. The method throws an exception if one the tranportLines is invalid.

__ths_pool.getTransports()__ :
Return a list of the configured pluggable transports, as an array of transportLines
