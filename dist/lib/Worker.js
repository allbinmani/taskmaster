'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _socket = require('socket.io-client');

var _socket2 = _interopRequireDefault(_socket);

var _child_process = require('child_process');

var _child_process2 = _interopRequireDefault(_child_process);

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Worker = function (_EventEmitter) {
	_inherits(Worker, _EventEmitter);

	function Worker(config, log) {
		_classCallCheck(this, Worker);

		var _this = _possibleConstructorReturn(this, (Worker.__proto__ || Object.getPrototypeOf(Worker)).call(this));

		_this._log = log;
		_this._config = config;
		_this._name = "worker-" + config._id + '@' + _os2.default.hostname();
		_this._taskProcess = null;
		_this._task = null;
		_this._idleTimer = false;
		_this._isIdle = true;
		_this._connect();
		return _this;
	}

	_createClass(Worker, [{
		key: '_connect',
		value: function _connect() {
			this._socket = (0, _socket2.default)(process.env.MASTER_URL);
			this._socket.on('connect', this._onConnected.bind(this));
			this._socket.on('disconnect', this._onDisconnected.bind(this));
			this._socket.on('task:run', this._onTaskRun.bind(this));
			this._socket.on('task:cancel', this._onTaskCancel.bind(this));
		}
	}, {
		key: 'done',
		value: function done(result) {
			this.Log.info('Task done', result);
			if (this._taskProcess) {
				this._taskProcess.kill();
				this._taskProcess = null;
			}
			this._socket.emit('task:done', JSON.stringify(this._task), JSON.stringify(result));
			this._task = undefined;
			this._setIdle(true);
		}
	}, {
		key: 'error',
		value: function error(_error) {
			this.Log.info({ error: _error }, 'Task error', _error);
			if (this._taskProcess) {
				this._taskProcess.kill();
				this._taskProcess = null;
			}
			this._socket.emit('task:error', JSON.stringify(_error), JSON.stringify(this._task));
			this._task = undefined;
			this._setIdle(true);
		}
	}, {
		key: '_setIdle',
		value: function _setIdle(isIdle) {
			var _this2 = this;

			this._isIdle = isIdle;
			if (isIdle === true) {
				this.Log.info("Set as idle, timer started");
				this._idleTimer = setTimeout(function () {
					_this2._setIdle(true);
				}, 30000 + Math.round(Math.random() * 10000));

				setTimeout(function () {
					_this2.Log.info("Requesting new task");
					_this2._socket.emit('task:request', { name: _this2.Name }); // TODO: Add a worker name
				}, 500);
			} else if (this._idleTimer) {
				clearTimeout(this._idleTimer);
				this._idleTimer = false;
				this.Log.info("idleTimer cancelled");
			} else {
				this.Log.info("Now busy.");
			}
		}
	}, {
		key: '_runTask',
		value: function _runTask(task) {
			var _this3 = this;

			this._setIdle(false);

			this.Log.info({ task: task, pwd: process.cwd() }, 'Starting Task');
			this._task = task;
			this._taskProcess = _child_process2.default.fork('task.js');

			this._taskProcess.send({ command: 'run', task: task });

			// Set the worker to not be idle until we hear back from the task.
			this._taskProcess.on('message', function (message) {
				switch (message.command) {
					case 'done':
						_this3.done(message.result);
						break;

					case 'error':
						_this3.error(message.err);
						break;

					case 'add':
						_this3.add(message.task);
						break;

					default:
						_this3.Log.info({ message: message }, 'Defaulting Message');
						console.log(message);
						break;
				}
			});
		}
	}, {
		key: '_onTaskRun',
		value: function _onTaskRun(taskJSON) {
			this.Log.info({ task: taskJSON }, 'New Task received!');
			this._setIdle(false);
			var taskParsed = void 0;
			try {
				taskParsed = JSON.parse(taskJSON);
			} catch (e) {
				this.Log.error('Failed to parse task', e);
			}
			if (taskParsed) {
				this._runTask(taskParsed);
			} else {
				this.error("Failed to parse Task");
			}
		}
	}, {
		key: '_onTaskCancel',
		value: function _onTaskCancel(taskJSON) {
			this.Log.info({ taskJSON: taskJSON }, 'Cancel Task');
			this._taskProcess.kill();
			this._setIdle(true);
			this.Log.info('Cancelled Task');
		}
	}, {
		key: '_onConnected',
		value: function _onConnected() {
			this.Log.info('Connected to master!');
			this._setIdle(true);
		}
	}, {
		key: '_onDisconnected',
		value: function _onDisconnected() {
			this.Log.error('Disconnected from master!');
		}
	}, {
		key: 'Id',
		get: function get() {
			return this.Config._id;
		}
	}, {
		key: 'Name',
		get: function get() {
			return this._name;
		}
	}, {
		key: 'Config',
		get: function get() {
			return this._config;
		}
	}, {
		key: 'Log',
		get: function get() {
			return this._log;
		}
	}, {
		key: 'CurrentTask',
		get: function get() {
			return this._task;
		}
	}, {
		key: 'Idle',
		get: function get() {
			return this._isIdle === true;
		}
	}]);

	return Worker;
}(_events2.default);

exports.default = Worker;