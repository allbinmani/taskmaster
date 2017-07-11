"use strict";

import EventEmitter from 'events';
import SocketIOClient from 'socket.io-client';

export default class Feeder extends EventEmitter
{
	constructor(config, log) {
		super();
		this._config = Object.assign({}, this.Defaults, config);
		this._log = log.child({role: 'feeder'});
		this._connect();
	}

	_connect() {
		this._socket = SocketIOClient('http://'+this.Config.master.host + ':' + this.Config.master.port);
		this._socket.on('connect', this._onConnected.bind(this));
		this._socket.on('disconnect', this._onDisconnected.bind(this));
	    this._socket.on('task:add:confirm', this._onTaskAddConfirm.bind(this));
	    this._socket.on('task:error', this._onTaskError.bind(this));
	}

	_onConnected() {
		this.Log.info('Connected to Master');
		this.emit('task:connect');
	}

	_onDisconnected() {
		this.Log.warn('Disconnected from Master!');
		this.emit('task:disconnect');
	}

	_onTaskError(msg) {
		this.Log.warn(msg, 'Task error');
		this.emit('task:error', msg);
	}

	_onTaskAddConfirm(tasks) {
		this.Log.info(tasks, 'Confirmed task(s)');
//        console.log('Task added', JSON.stringify(tasks));
        this.emit('task:add:confirm', tasks);
	}

	get Config() {
		return this._config;
	}

	get Log() {
		return this._log;
	}

	get isConnected() {
		return this._socket && this._socket.connected;
	}

	get Defaults() {
		return {master:{host:'localhost', port: 3000}};
	}

	add(newTasks) {
		if(!this.isConnected) {
			this._socket.once('connect', () => {
				this._socket.emit('task:add', newTasks)
			});
		} else {
			this._socket.emit('task:add', newTasks);
		}
	}
}
