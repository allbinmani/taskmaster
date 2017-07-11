
import Worker from './lib/Worker';
import bunyan from 'bunyan';

let log = bunyan.createLogger({name:'worker'});

log.info('Starting');
let worker = new Worker({_id: process.pid}, log);

worker.on('exit', () => {
	log.info('Exited');
});
