'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _child_process = require('child_process');

var _child_process2 = _interopRequireDefault(_child_process);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Runner = function (_EventEmitter) {
	_inherits(Runner, _EventEmitter);

	function Runner(config, log) {
		_classCallCheck(this, Runner);

		var _this = _possibleConstructorReturn(this, (Runner.__proto__ || Object.getPrototypeOf(Runner)).call(this));

		_this._log = log.child({ role: 'runner' });
		_this._config = config;
		_this._createWorkers();
		return _this;
	}

	_createClass(Runner, [{
		key: '_spawnWorker',
		value: function _spawnWorker() {
			var w = _child_process2.default.spawn(this._config.runner.spawnCommand || process.argv[0], (this._config.runner.spawnArgs || []).concat([this._config.runner.workerScript || 'worker.js']), { detached: false, //true,
				env: Object.assign({ MASTER_URL: 'http://' + this._config.master.host + ':' + this._config.master.port }, process.env),
				stdio: [0, 1, 2] //['ignore', 'ignore', 'ignore']}
			});
			this._log.info({ cmdline: w.spawnargs.join(' ') }, 'Spawned worker');
			return w;
		}
	}, {
		key: '_createWorkers',
		value: function _createWorkers() {
			var _this2 = this;

			this._workers = [];
			this._log.info(this._config.runner.maxWorkers, "maxWorkers");
			for (var i = 0; i < this._config.runner.maxWorkers; i++) {
				this._workers.push(this._spawnWorker());
			}
			//		this._log.info(this._workers);
			this._workers.forEach(function (w) {
				w.on('exit', function () {
					var idx = _this2._workers.indexOf(w);
					if (idx !== -1) {
						_this2._workers.splice(idx, 1);
					}
					_this2._log.warn({ worker: w.stderr }, 'Worker exited!');
					if (_this2._workers.length < _this2._config.runner.maxWorkers) {
						setTimeout(function () {
							_this2._workers.push(_this2._spawnWorker());
						}, 5000);
					}
				});
			});
			this._log.info({ workers: this._workers.map(function (w) {
					return w.pid;
				}) }, 'Workers created');
		}
	}, {
		key: 'Config',
		get: function get() {
			return this._config;
		}
	}]);

	return Runner;
}(_events2.default);

exports.default = Runner;