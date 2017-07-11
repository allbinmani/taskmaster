
import EventEmitter from 'events';
import Child from 'child_process';

export default class Runner extends EventEmitter
{
	constructor(config, log) {
		super();
		this._log = log.child({role: 'runner'});
		this._config = config;
		this._createWorkers();
	}

	_spawnWorker() {
		let w = Child.spawn(
				this._config.runner.spawnCommand||process.argv[0], 
				(this._config.runner.spawnArgs||[]).concat([this._config.runner.workerScript||'worker.js']),
				{detached: false, //true,
				 env: Object.assign({MASTER_URL: 'http://'+this._config.master.host + ':' + this._config.master.port}, process.env),
				 stdio: [0,1,2]} //['ignore', 'ignore', 'ignore']}
				);
		this._log.info({cmdline: w.spawnargs.join(' ')}, 'Spawned worker');
		return w;
	}

	_createWorkers() {
		this._workers = [];
		this._log.info(this._config.runner.maxWorkers, "maxWorkers");
		for(let i=0; i < this._config.runner.maxWorkers; i++) {
			this._workers.push(this._spawnWorker());
		}
//		this._log.info(this._workers);
		this._workers.forEach(w => {
			w.on('exit', () => {
				let idx = this._workers.indexOf(w);
				if(idx !== -1) {
					this._workers.splice(idx,1);
				}
				this._log.warn({worker: w.stderr}, 'Worker exited!');
				if(this._workers.length < this._config.runner.maxWorkers) {
					setTimeout(() => {
						this._workers.push(this._spawnWorker());
					}, 5000);
				}
			});
		});
		this._log.info({workers: this._workers.map(w=>w.pid)}, 'Workers created');
	}

	get Config() {
		return this._config;
	}
}
