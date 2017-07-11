
import EventEmitter from 'events';
import SocketIO from 'socket.io';
import Mongoose from 'mongoose';
import moment from 'moment';
import Async from 'async';
import bunyan from 'bunyan';
import TaskModel from './TaskModel';
import _ from 'lodash';

export default class Master extends EventEmitter
{
	constructor(config, log) {
		super();
		this._config = config;
		this._log = log.child({role: 'Master'});
	    this.Log.info('Started');

	    this._io = SocketIO(config.master.port);
	    this._io.on('connection', this._onIOConnection.bind(this));
	    this._io.on('error', this._onIOError.bind(this));

	    // Keep a variable so we know if we are in the process of assigning tasks.
	    this._assigningTasksCount = 0;
	    this._assigningTasks = false;

	    this._timeout = config.runner.worker.timeout || 300000; // 5 minutes is the default timeout time for master
	    this._timeout += 10000; //Add 10 seconds so the time is slightly longer than that for the worker

	    // Module configuration
	    Mongoose.connect(config.master.mongoURL, {useMongoClient: true});
	    this.Log.info('Connecting to ' + config.master.mongoURL);

        this._debugMongoose();

	    // Connect to database and get the list of tasks
	    this._db = Mongoose.connection;
	    this._db.on('error', this._onDbError.bind(this));
	    this._db.on('connected', this._onDbConnect.bind(this));
	    this._db.on('disconnected', this._onDbDisconnect.bind(this));

        //this._periodic_assign_timer = setInterval(this._assignTasks.bind(this), 5000);
	}

    _debugMongoose() {
        Mongoose.set('debug', (coll, method, query, doc, options) => {
            let set = {
                coll: coll,
                method: method,
                query: query,
                doc: doc,
                options: options
            };

            // this._log.info({
            //     dbQuery: set
            // });
        });

    }

	_onIOConnection(socket) {
        this.Log.info('New Worker connected.  (', this._findWorkers().length, ')');

        socket.on('disconnect', 	this._onWorkerDisconnect.bind(this));
        socket.on('error', 			this._onWorkerError.bind(this));
        socket.on('task:request', (msg) => this._onWorkerTaskRequest(socket, msg));
        socket.on('task:done', 	  (taskJSON, result) => this._onWorkerTaskDone(socket, taskJSON, result));
        socket.on('task:error',   (err, taskJSON) => this._onWorkerTaskError(socket, err, taskJSON));
        socket.on('task:add',     (tasks) => this._onWorkerTaskAdd(socket, tasks));
	}

	_onWorkerTaskRequest(socket, msg) {
        socket._idleWorker = true;
        if(msg.name) {
            this._workerName = msg.name;
        }
    	this.Log.info('Worker (%s) requesting a new task', this._workerName);
    	this._assignTasks();
	}

	_onWorkerTaskDone(socket, taskJSON, result) {
        this.Log.info({task:taskJSON, result:result},'Worker task done');
        clearTimeout(socket._timer);

        let taskParsed = JSON.parse(taskJSON);
        TaskModel.findById(taskParsed._id, (err, task) => {
            if(err) {
                this.Log.error({err: err}, 'Error finding task');
                return;
            }
            task.result = result;
            task.assigned.completed = moment().unix();
            task.assigned.status = 'done';
            task.save((err) => { 
                if(err) {
                    this.Log.error({err: err}, 'Error saving task');
                    return;
                }
                this.Log.info({task: task, result: result}, 'Task completed successfully');
            });

        });
	}

	_onWorkerTaskError(socket, err, taskJSON) {
        this.Log.info({task:taskJSON, error:err},'Worker task error');
        clearTimeout(socket._timer);
        let taskParsed = JSON.parse(taskJSON);
        TaskModel.findById(taskParsed._id, (err, task) => {
            if(err) {
                this.Log.error({err: err}, 'Error finding task');
                return;
            }
            task.result = err;
            task.assigned.status = 'error';
            task.save((err) => { 
                if(err) {
                    this.Log.error({err: err}, 'Error saving task');
                    return;
                }
                this.Log.info({task: task}, 'Task completed with error');
            });

        });
	}

	_onWorkerTaskAdd(socket, tasks) {
        tasks = _.isArray(tasks) ? tasks : [tasks];
        Async.each(tasks, (task, next) => {

            // Only allow one task with a given module, params, and dependencies
            TaskModel.update({
                module: task.module,
                params: task.params,
                dependencies: task.dependencies
            }, task, {upsert: true}, (err) => {
                if (err) {
                    return next(err, task);
                }

                this.Log.info({task: task}, 'Task added');
                next(null, task);
            });
        }, (err, task) => {
            if (err) {
                socket.emit('task:add:failed', JSON.stringify(task));
                return this.Log.error({err: err, task: task}, 'Error while adding task');
            }

            socket.emit('task:add:confirm', JSON.stringify(task));

            this._assignTasks();
        });

	}


	_onWorkerDisconnect() {
        this.Log.info('Worker disconnected.  (', this._findWorkers().length, ')');		
	}

	_onWorkerError(e) {
        this.Log.info('Worker socket had an error' + e);		
	}

    _onIOError(e) {
        this.Log.info('SocketIO error' + e);
    }

	_onDbError(err) {
		this.Log.error('Database error: ' + err);
		this.emit('error', err);
	}

	_onDbConnect() {
		this.Log.info('Connected to Database');
		this.emit('info', 'db_connected');
	}

	_onDbDisconnect(err) {
		this.Log.warn('Disconnected from Database:' + err);
		this.emit('warn', 'db_disconnected');
	}

	/**
     * Searches for workers connected to the socket.io master (Copied from some where online)
     *
     * @param {String} [namespace] - Filter workers by namespace
     * @param {String} [room] - Filter workers by room
     * @returns {Array} - List of workers
     */
	_findWorkers(namespace, room) {
        let workers = [], ns = this._io.of(namespace || "/");

        if (ns) {
            for (let id in ns.connected) {
                if (room) {
                    let index = ns.connected[id].rooms.indexOf(room);
                    if (index !== -1) {
                        workers.push(ns.connected[id]);
                    }
                } else {
                    workers.push(ns.connected[id]);
                }
            }
        }
        return workers;
	}


    /**
     * Assigns the next available task to the next available worker while there is still an available task and worker.
     * This is done synchronously since multiple instances of it may be running at a time.
     */
    _assignTasks(doNotIncrement) {
        if (!doNotIncrement) {
            this._assigningTasksCount++;
        }

        if (this._assigningTasksCount > 0 && !this._assigningTasks) {
            this._assigningTasks = true;

            let socket;
            let task;

            // While there is an idle worker
            Async.during(
                (callback) => {
                    // Find an idle worker.
                    socket = _.find(this._findWorkers(), (worker) => {return worker._idleWorker});

                    if (_.isEmpty(socket)) {
                        return callback(null, false);
                    }

                    // Find an available task
                    this._findNextTask( (nextTask) => {
                        this.Log.info({task: nextTask, isSocket: !_.isEmpty(socket)}, 'Task found');
                        task = nextTask;
                        return callback(null, !_.isEmpty(nextTask));
                    });
                },
                (next) => {
                    // Mark the task as assigned
                    task.assigned.who = socket._workerName || 'workername'; // TODO: Pull the worker name from the socket
                    task.assigned.when = moment().unix();
                    task.assigned.status = 'assigned';

                    task.save((err) => {
                        if (err) {
                        	return next(err);
                        }

                        socket.emit('task:run', JSON.stringify(task));
                        socket._idleWorker = false;

                        // Use global timeout unless specific task timeout is set.
                        let taskTimeout = task.timeout || this._timeout;
                        let _assignTasks = this._assignTasks.bind(this);
                        // Set a timer which will deal with workers which die while working.
                        socket._timer = setTimeout((function() {  // yes, function, see bind
                            let socket = this.socket;
                            let task = this.task;
                            let message = 'Task timed out without response from worker.';
                            let err = 'Task assigned ' + moment.unix(task.assigned.when).format();
                            socket._idleWorker = true;
                            socket.emit('task:cancel', JSON.stringify(task));
                            this._log.error({err: err}, message);

                            if (task) {
                                task.assigned.status = 'timeout';

                                task.save( (err) => {
                                    if (err) {
                                    	return this._log.error({err: err}, 'Error un-assigning task assignment to mongodb');
                                    }

                                    _assignTasks();
                                });
                            } else {
                                _assignTasks();
                            }
                        }).bind({task: task, _log: this._log, socket: socket}), taskTimeout);

                        // Log that the task was paired and sent.
                        this.Log.info({task: task}, 'Task sent');
                        next();
                    });
                },
                (err) => {
                    if (err) {
                    	this.Log.error({err: err}, 'Error assigning task');
                    }
                    this._assigningTasks = false;
                    this._assigningTasksCount--;
                    this._assignTasks(true); // Call assign tasks again to make sure we are running it again after a worker has requested and set itself to idle.
                    this.Log.info('assignTasks done');
                }
            );
        }
    }

    /**
     * Finds the next available task.
     * Next available task is one that:
     *  - has not been assigned
     *  - is sorted by priority descending
     *  - is sorted by created ascending
     *  and:
     *  - has no dependencies unmet
     */
    _findNextTask(callback) {
        // Find tasks that have not been assigned yet
        TaskModel.find({$or: [/* has never been assigned? */
                              {assigned: {$exists: false}},

                              /* has been assigned, but returned an error */
                              {$and: [{assigned: {$exists: true}},
                                      {'assigned.completed': {$exists: false}},
                                      {'assigned.status': 'error'}]},

                              /* has been explicitly marked as timed out */
                              {$and: [{assigned: {$exists: true}},
                                      {'assigned.completed': {$exists: false}},
                                      {'assigned.status': 'timeout'}]},

                              /* has been assigned, but might have timed out */
                              {$and: [{assigned: {$exists: true}},
                                      {'assigned.when': {$lte: moment().add(-this._timeout, 'ms').unix()}},
                                      {'assigned.status': 'assigned'}]}
                              ]})
        //where('assigned.completed').exists(false)
            .sort('-priority created')
            // Added a limit because there can be millions of unassigned,
            // tasks needing attention which can drastically affect performance.
//            .limit(1000)
            .exec((err, unassignedTasks) => {
                if (err) {
                	return this.Log.error(err, 'Unable to connect to database to get an unassigned task');
                }
                this.Log.info(unassignedTasks.length, 'Unassigned task count');
                // Find a task whose dependencies are complete
                // TODO: Since there is now a limit on the initial tasks called,
                // we need to account for not having the full list when checking.
                Async.detectSeries(unassignedTasks, (unassignedTask, next) => {
                    this._log.info({unassignedTask: unassignedTask}, "Considering unassigned");
                    // Check if assign and if assigned if the assignment has not expired if so return false.
                    if (unassignedTask.assigned && unassignedTask.assigned.when) {
                        let taskTimeout = unassignedTask.timeout || this._timeout;
                        if (moment.unix(unassignedTask.assigned.when).isAfter(moment().add(taskTimeout, 'ms'))) {
                            this._log.info({timedOutTask: unassignedTask}, "Task has timed out, re-assigning!");
                            return next(false);
                        } else {
                            this._log.info({timedOutTask: unassignedTask,
                                            taskTimeout: taskTimeout}, "Task has timed out!???!");
                        }
                    }
                    if (unassignedTask.dependencies && unassignedTask.dependencies.length > 0) {
                        this._log.info({deps: unassignedTask.dependencies}, 'dependencies');
                        TaskModel
//                            .where('assigned.completed').exists(true)
                            .where('assigned.status="done"')
                            .or(unassignedTask.dependencies)
                        	.exec((err, completedDependencyTasks) => {
	                            if (err) {
	                            	return this.Log.error(err, 'Unable to connect to database to get dependencies');
	                            }
	                            this._log.info({completed:completedDependencyTasks}, completedDependencyTasks.length, 'Completed dependencies');
	                            // If every dependency matches any completedDependency then we have found the next task
	                            return next(_.every(unassignedTask.dependencies, (dependency) => {
	                                return _.any(completedDependencyTasks, (completedDependencyTask) => {
	                                    return _.isMatch(completedDependencyTask.toObject(), dependency);
	                                })
	                            }));
	                        });
                    } else {
                        return next(true);
                    }
                }, (taskToAssign) => {
                    callback(taskToAssign);
                });
            }
        );
    }

	get Config() {
		return this._config;
	}

    get Log() {
        return this._log;
    }
}