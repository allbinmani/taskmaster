"use strict";

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _socket = require('socket.io-client');

var _socket2 = _interopRequireDefault(_socket);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Feeder = function (_EventEmitter) {
	_inherits(Feeder, _EventEmitter);

	function Feeder(config, log) {
		_classCallCheck(this, Feeder);

		var _this = _possibleConstructorReturn(this, (Feeder.__proto__ || Object.getPrototypeOf(Feeder)).call(this));

		_this._config = Object.assign({}, _this.Defaults, config);
		_this._log = log.child({ role: 'feeder' });
		_this._connect();
		return _this;
	}

	_createClass(Feeder, [{
		key: '_connect',
		value: function _connect() {
			this._socket = (0, _socket2.default)('http://' + this.Config.master.host + ':' + this.Config.master.port);
			this._socket.on('connect', this._onConnected.bind(this));
			this._socket.on('disconnect', this._onDisconnected.bind(this));
			this._socket.on('task:add:confirm', this._onTaskAddConfirm.bind(this));
			this._socket.on('task:error', this._onTaskError.bind(this));
		}
	}, {
		key: '_onConnected',
		value: function _onConnected() {
			this.Log.info('Connected to Master');
			this.emit('task:connect');
		}
	}, {
		key: '_onDisconnected',
		value: function _onDisconnected() {
			this.Log.warn('Disconnected from Master!');
			this.emit('task:disconnect');
		}
	}, {
		key: '_onTaskError',
		value: function _onTaskError(msg) {
			this.Log.warn(msg, 'Task error');
			this.emit('task:error', msg);
		}
	}, {
		key: '_onTaskAddConfirm',
		value: function _onTaskAddConfirm(tasks) {
			this.Log.info(tasks, 'Confirmed task(s)');
			//        console.log('Task added', JSON.stringify(tasks));
			this.emit('task:add:confirm', tasks);
		}
	}, {
		key: 'add',
		value: function add(newTasks) {
			var _this2 = this;

			if (!this.isConnected) {
				this._socket.once('connect', function () {
					_this2._socket.emit('task:add', newTasks);
				});
			} else {
				this._socket.emit('task:add', newTasks);
			}
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
		key: 'isConnected',
		get: function get() {
			return this._socket && this._socket.connected;
		}
	}, {
		key: 'Defaults',
		get: function get() {
			return { master: { host: 'localhost', port: 3000 } };
		}
	}]);

	return Feeder;
}(_events2.default);

exports.default = Feeder;