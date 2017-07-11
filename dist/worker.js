'use strict';

var _Worker = require('./lib/Worker');

var _Worker2 = _interopRequireDefault(_Worker);

var _bunyan = require('bunyan');

var _bunyan2 = _interopRequireDefault(_bunyan);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var log = _bunyan2.default.createLogger({ name: 'worker' });

log.info('Starting');
var worker = new _Worker2.default({ _id: process.pid }, log);

worker.on('exit', function () {
	log.info('Exited');
});