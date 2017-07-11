
import EventEmitter from 'events';
import SocketIOClient from 'socket.io-client';
import Child from 'child_process';
import OS from 'os';

export default class Worker extends EventEmitter
{
	constructor(config, log) {
		super();
		this._log = log;
		this._config = config;
		this._name = "worker-"+config._id+'@'+OS.hostname();
		this._taskProcess = null;
		this._task = null;
		this._idleTimer = false;
		this._isIdle = true;
		this._connect();
	}

	_connect() {
		this._socket = SocketIOClient(process.env.MASTER_URL);
		this._socket.on('connect', this._onConnected.bind(this));
		this._socket.on('disconnect', this._onDisconnected.bind(this));
		this._socket.on('task:run', this._onTaskRun.bind(this));
		this._socket.on('task:cancel', this._onTaskCancel.bind(this));
	}

	get Id() {
		return this.Config._id;
	}

	get Name() {
		return this._name;
	}

	get Config() {
		return this._config;
	}

	get Log() {
		return this._log;
	}

	get CurrentTask() {
		return this._task;
	}

	get Idle() {
		return this._isIdle === true;
	}

	done(result) {
	    this.Log.info('Task done', result);
	    if(this._taskProcess) {
		    this._taskProcess.kill();
		    this._taskProcess = null;
		}
	    this._socket.emit('task:done', JSON.stringify(this._task), JSON.stringify(result));
	    this._task = undefined;
		this._setIdle(true);
	}

	error(error) {
	    this.Log.info({error:error}, 'Task error', error);
	    if(this._taskProcess) {
		    this._taskProcess.kill();
		    this._taskProcess = null;
		}
	    this._socket.emit('task:error', JSON.stringify(error), JSON.stringify(this._task));
	    this._task = undefined;
		this._setIdle(true);
	}

	_setIdle(isIdle) {
		this._isIdle = isIdle;
		if(isIdle === true) {
			this.Log.info("Set as idle, timer started");
			this._idleTimer = setTimeout(() => {
				this._setIdle(true);
			}, 30000+Math.round(Math.random()*10000));

			setTimeout(() => {
				this.Log.info("Requesting new task");
				this._socket.emit('task:request', {name:this.Name}); // TODO: Add a worker name
			}, 500);
		}
		else if(this._idleTimer) {
			clearTimeout(this._idleTimer);
			this._idleTimer = false;
			this.Log.info("idleTimer cancelled");
		} else {
			this.Log.info("Now busy.");
		}
	}

	_runTask(task) {
	    this._setIdle(false);

	    this.Log.info({task: task, pwd: process.cwd() }, 'Starting Task');
	    this._task = task;
	    this._taskProcess = Child.fork('task.js');

	    this._taskProcess.send({command: 'run', task: task});

	    // Set the worker to not be idle until we hear back from the task.
	    this._taskProcess.on('message', (message) => {
	        switch (message.command) {
	            case 'done':
	                this.done(message.result);
	                break;

	            case 'error':
	                this.error(message.err);
	                break;

	            case 'add':
	                this.add(message.task);
	                break;

	            default:
	                this.Log.info({message: message}, 'Defaulting Message');
	                console.log(message);
	                break;
	        }
	    });

	}

	_onTaskRun(taskJSON) {
    	this.Log.info({task:taskJSON}, 'New Task received!');
	    this._setIdle(false);
	    let taskParsed;
	    try {
		    taskParsed = JSON.parse(taskJSON);
		} catch(e) {
			this.Log.error('Failed to parse task', e);
		}
		if(taskParsed) {
			this._runTask(taskParsed);
		} else {
            this.error("Failed to parse Task");
		}
	}

	_onTaskCancel(taskJSON) {
		this.Log.info({taskJSON: taskJSON}, 'Cancel Task');
    	this._taskProcess.kill();
		this._setIdle(true);
		this.Log.info('Cancelled Task');
	}

	_onConnected() {
		this.Log.info('Connected to master!');
		this._setIdle(true);
	}

	_onDisconnected() {
		this.Log.error('Disconnected from master!');
	}

}