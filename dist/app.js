'use strict';

var _bunyan = require('bunyan');

var _bunyan2 = _interopRequireDefault(_bunyan);

var _Master = require('./lib/Master');

var _Master2 = _interopRequireDefault(_Master);

var _Runner = require('./lib/Runner');

var _Runner2 = _interopRequireDefault(_Runner);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

console.log('process.argv.length', process.argv.length);
var log = _bunyan2.default.createLogger({ name: 'TaskMasterV2' });
var config = require(process.argv[2] || './config.json');
if (config.role === 'master') {
	log.info("Starting Master");
	var master = new _Master2.default(config, log);
	//console.log(master._io);
} else {

	log.info("Starting Runner");
	var runner = new _Runner2.default(config, log);
	//console.log(runner);
}