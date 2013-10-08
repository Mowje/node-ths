# node-ths

------------------------------------------

node-ths (node - Tor Hidden Services) is a node.js module allowing you to create and manage [Tor hidden services](https://www.torproject.org/docs/hidden-services) from your app.

### Overview

Part of a bigger project, I needed to be able to to create and manage programmatically Tor Hidden Services from a Node.js application.

With this module, you can :

* Create and delete hidden services
* Adding and removing port bindings to existing hidden services

When you start this module, it runs a dedicated instance of Tor for the hidden services. As of now settings are passed as command line arguments. There is one issue with this, it's that you need to restart the "entire" tor instance to apply settings changes. For further versions, maybe I can use the tor control port/protocol to update settings.

### Requirements

* [Node.js](http://nodejs.org)
* [Tor](https://torproject.org), installed so that it could be called from terminal/command line by running a simple "tor" command

### Installation

Simply run

	npm install ths
	
from your app's folder to install the module

### Usage

_Preliminary note_ : whenever you modify a setting, the new config isn't written. You have to explicitly call the ```saveConfig()``` method. Also, the new changes aren't applied unless you (re)start the tor instance.

__ths([thsFolder], [socksPortNumber], [showTorMessages])__ :

Constructor of a node-ths module instance. Note that this constructor calls the ```loadConfig()``` method.
	
* thsFolder : the folder that will contain the ths-data folder. ths.conf file and the hidden services' keys and hostname files. Also, this is where the tor "DataDirectory" is found(necessary and unique for each tor instance). This parameter defaults to "/path/to/your/app/ths-data"
* socksPortNumber : the SOCKS server port that the underlying tor instance will use. Defaults to port 9999
* showTorMessages : a boolean, determining whether usual tor console messages should be shown of not. Defaults to false

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

__ths.createHiddenService(serviceName, ports, [startTor], [force], [bootstrapCallback])__ :

Creates a new tor hidden service :

* [port] : Port string or array of port strings. These strings must have the same format/syntax as for a "HiddenServicePort" in a usual torrc config file. This is how it works (harvested from the tor man page) :
```	
HiddenServicePort VIRTPORT [TARGET]
Configure a virtual port VIRTPORT for a hidden service. You may use this option multiple times; each time applies to the service using the most recent hiddenservicedir. By default, this option maps the virtual port to the same port on 127.0.0.1 over TCP. You may override the target port, address, or both by specifying a target of addr, port, or addr:port. You may also have multiple lines with the same VIRTPORT: when a user connects to that VIRTPORT, one of the TARGETs from those lines will be chosen at random.
```
* serviceName : a "human-readable" name for the service. This service's identifier for the node-ths module. It will be asked by some other methods. This name is restricted to alphanumerical chars, hyphens and underscores (no spaces)
* startNow : a boolean determining whether the underlying tor instance should be started at the end of this method. Defaults to false
* force : a boolean determining whether the tor instance start should be forced or not (restarting tor if it is already running). Defaults to false
* callback : a callback function called when the tor instance is started and bootstrapped

__ths.removeHiddenService(serviceName, [startTor], [force], [bootstrapCallback])__ :

Removes the hidden service with the given serviceName

* serviceName : name of the hidden service to be removed
* startTor : a boolean, determining whether the tor instance should be started or not. Defaults to false.
* force : a boolean, determining whether the tor start should be forced if startTor == true (ie restarting an instance if one is running). Defaults to false.
* bootstrapCallback : a callback function, with no parameters, executed when the tor instance is started and bootstraped

__ths.addPorts(serviceName, ports, [startTor], [force], [bootstrapCallback])__ :

Add ports bindings to an existing hidden service

* serviceName : the name of the service to which we'll add the ports
* ports : ports entry or array of port entries to be added
* startTor : a boolean, determining whether the tor instance should be started at the end of this method. Defaults to false
* force : a boolean, determining whether the tor start should be forced if startTor == true (ie restarting an instance if one is running). Defaults to false.
* bootstrapCallback : a callback function, with no parameters, executed when the tor instance is started and bootstrapped

__ths.removePorts(serviceName, ports, [deleteIfEmptied], [startTor], [force], [bootstrapCallback])__ :

Removes the given ports from the given service

* serviceName : the name of the service from which we'll remove the ports
* ports : ports entry or array of port entries to be removed
* deleteIfEmptied : a boolean, determining whether the hidden service should be deleted if there are no more ports entry in it. Defaults to false.
* startTor : a boolean, determining whether the tor instance should be started at the end of this method. Defaults to false
* force : a boolean, determining whether the tor start should be forced if startTor == true (ie restarting an instance if one is running). Defaults to false
* bootstrapCallback : a callback function, with no parameters, executed when the tor instance is started and bootsrapped

__ths.getServices()__ :

Returns the service list

__ths.getOnionAddress(serviceName)__ :

Returns the .onion hostname for the given service

* serviceName : name of the service you are looking for

__ths.loadConfig()__ :

(Re)loads the config file. This method is invoked when a ths instance is constructed.

__ths.saveConfig()__ :

Saves the config. Must be called when changes are made to the config (service addition/deletion, ports addition/deletion)
