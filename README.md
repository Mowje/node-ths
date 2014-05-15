# node-ths

------------------------------------------

node-ths (node - Tor Hidden Services) is a node.js module allowing you to create and manage [Tor hidden services](https://www.torproject.org/docs/hidden-services) from your app.

## Overview

Part of a bigger project, I needed to be able to to create and manage programmatically Tor Hidden Services from a Node.js application.

With this module, you can :

* Create and delete hidden services
* Adding and removing port bindings to existing hidden services

When you start this module, it runs a dedicated instance of Tor for the hidden services. It writes a dedicated torrc file. Whenever you change a setting, the torrc file is update and the config is reload through a signal sent on the tor control port.

## Requirements

* [Node.js](http://nodejs.org)
* [Tor](https://torproject.org), installed so that it could be called from terminal/command line by running a simple ```tor``` command

## Installation

Simply run

	npm install ths

from your app's folder to install the module

## Usage

_Preliminary note_ : whenever you modify a setting, the new config isn't written. You have to explicitly call the ```saveConfig()``` method or set `applyNow = true` in methods that allow this parameter. Changes are applied without restarting the tor instance.

__ths([thsFolder], [socksPortNumber], [controlPortNumber], [torErrorHandler], [torMessageHandler], [torControlMessageHandler])__ :

Constructor of a node-ths module instance. Note that this constructor calls the ```loadConfig()``` method.

* thsFolder : the folder that will contain the ths-data folder. ths.conf file and the hidden services' keys and hostname files. Also, this is where the tor "DataDirectory" is found(necessary and unique for each tor instance). This parameter defaults to "/path/to/your/app/ths-data"
* socksPortNumber : the SOCKS server port that the underlying tor instance will use. Defaults to port 9999
* controlPortNumber : the Tor control port number. Used to force the process to reload the config without restarting. Defaults to 9998.
* torErrorHandler: a function that will receive Tor's warnings and error messages (one paramater, as a string). Optional. Not used by default.
* torMessageHandler : a function that will receive standard Tor info messages (one parameter, as a string). Optional. Not used by default.
* torControlMessageHandler : a function that will receive the control messages coming from the control port of the Tor process (one parameter, as a string). Optional. Not used by default.

*Example :*

	var thsBuilder = require('ths');
	var ths = thsBuilder(__dirname);

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

* [port] : Port string or array of port strings. These strings must have the same format/syntax as for a "HiddenServicePort" in a usual torrc config file. This is how it works (harvested from the tor man page) :
```
HiddenServicePort VIRTPORT [TARGET]
Configure a virtual port VIRTPORT for a hidden service. You may use this option multiple times; each time applies to the service using the most recent hiddenservicedir. By default, this option maps the virtual port to the same port on 127.0.0.1 over TCP. You may override the target port, address, or both by specifying a target of addr, port, or addr:port. You may also have multiple lines with the same VIRTPORT: when a user connects to that VIRTPORT, one of the TARGETs from those lines will be chosen at random.
```
* serviceName : a "human-readable" name for the service. This service's identifier for the node-ths module. It will be asked by some other methods. This name is restricted to alphanumerical chars, hyphens and underscores (no spaces)
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

__ths.getOnionAddress(serviceName)__ :

Returns the .onion hostname for the given service

* serviceName : name of the service you are looking for

__ths.torPid()__ :

Returns the PID of the current Tor process, if it exists.

__ths.socksPort()__ :

Returns the SOCKS port number Tor process is running on.

__ths.loadConfig()__ :

(Re)loads the config file. This method is invoked when a ths instance is constructed.

__ths.saveConfig()__ :

Saves the config. Must be called when changes are made to the config (service addition/deletion, ports addition/deletion)
