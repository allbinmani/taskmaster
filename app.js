
import bunyan from 'bunyan';

import Master from './lib/Master';
import Runner from './lib/Runner';

console.log('process.argv.length', process.argv.length);
let log = bunyan.createLogger({name: 'TaskMasterV2'});
const config = require(process.argv[2] || './config.json');
if(config.role === 'master') {
	log.info("Starting Master");
	let master = new Master(config, log);
	//console.log(master._io);
} else {

	log.info("Starting Runner");
	let runner = new Runner(config, log);
	//console.log(runner);
}
