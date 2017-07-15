'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _socket = require('socket.io');

var _socket2 = _interopRequireDefault(_socket);

var _mongoose = require('mongoose');

var _mongoose2 = _interopRequireDefault(_mongoose);

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

var _async = require('async');

var _async2 = _interopRequireDefault(_async);

var _bunyan = require('bunyan');

var _bunyan2 = _interopRequireDefault(_bunyan);

var _TaskModel = require('./TaskModel');

var _TaskModel2 = _interopRequireDefault(_TaskModel);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Master = function (_EventEmitter) {
    _inherits(Master, _EventEmitter);

    function Master(config, log) {
        _classCallCheck(this, Master);

        var _this = _possibleConstructorReturn(this, (Master.__proto__ || Object.getPrototypeOf(Master)).call(this));

        _this._config = config;
        _this._log = log.child({ role: 'Master' });
        _this.Log.info('Started');

        _this._io = (0, _socket2.default)(config.master.port);
        _this._io.on('connection', _this._onIOConnection.bind(_this));
        _this._io.on('error', _this._onIOError.bind(_this));

        // Keep a variable so we know if we are in the process of assigning tasks.
        _this._assigningTasksCount = 0;
        _this._assigningTasks = false;

        _this._timeout = config.runner.worker.timeout || 300000; // 5 minutes is the default timeout time for master
        _this._timeout += 10000; //Add 10 seconds so the time is slightly longer than that for the worker

        // Module configuration
        var mongo_url = process.env.MONGO_URL || 'mongodb://localhost/test';
        _mongoose2.default.connect(mongo_url, { useMongoClient: true });
        _this.Log.info('Connecting to ' + mongo_url);

        _this._debugMongoose();

        // Connect to database and get the list of tasks
        _this._db = _mongoose2.default.connection;
        _this._db.on('error', _this._onDbError.bind(_this));
        _this._db.on('connected', _this._onDbConnect.bind(_this));
        _this._db.on('disconnected', _this._onDbDisconnect.bind(_this));

        //this._periodic_assign_timer = setInterval(this._assignTasks.bind(this), 5000);
        return _this;
    }

    _createClass(Master, [{
        key: '_debugMongoose',
        value: function _debugMongoose() {
            _mongoose2.default.set('debug', function (coll, method, query, doc, options) {
                var set = {
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
    }, {
        key: '_onIOConnection',
        value: function _onIOConnection(socket) {
            var _this2 = this;

            this.Log.info('New Worker connected.  (', this._findWorkers().length, ')');

            socket.on('disconnect', this._onWorkerDisconnect.bind(this));
            socket.on('error', this._onWorkerError.bind(this));
            socket.on('task:request', function (msg) {
                return _this2._onWorkerTaskRequest(socket, msg);
            });
            socket.on('task:done', function (taskJSON, result) {
                return _this2._onWorkerTaskDone(socket, taskJSON, result);
            });
            socket.on('task:error', function (err, taskJSON) {
                return _this2._onWorkerTaskError(socket, err, taskJSON);
            });
            socket.on('task:add', function (tasks) {
                return _this2._onWorkerTaskAdd(socket, tasks);
            });
        }
    }, {
        key: '_onWorkerTaskRequest',
        value: function _onWorkerTaskRequest(socket, msg) {
            socket._idleWorker = true;
            if (msg.name) {
                this._workerName = msg.name;
            }
            this.Log.info('Worker (%s) requesting a new task', this._workerName);
            this._assignTasks();
        }
    }, {
        key: '_onWorkerTaskDone',
        value: function _onWorkerTaskDone(socket, taskJSON, result) {
            var _this3 = this;

            this.Log.info({ task: taskJSON, result: result }, 'Worker task done');
            clearTimeout(socket._timer);

            var taskParsed = JSON.parse(taskJSON);
            _TaskModel2.default
            //                            .where('assigned.completed').exists(true)
            .findById(taskParsed._id, function (err, task) {
                if (err) {
                    _this3.Log.error({ err: err }, 'Error finding task');
                    return;
                }
                if (!task) {
                    _this3.Log.error({ err: err }, 'Could not find task');
                    return;
                }
                task.result = result;
                task.assigned.completed = (0, _moment2.default)().unix();
                task.assigned.status = 'done';
                task.save(function (err) {
                    if (err) {
                        _this3.Log.error({ err: err }, 'Error saving task');
                        return;
                    }
                    _this3.Log.info({ task: task, result: result }, 'Task completed successfully');
                });
            });
        }
    }, {
        key: '_onWorkerTaskError',
        value: function _onWorkerTaskError(socket, err, taskJSON) {
            var _this4 = this;

            this.Log.info({ task: taskJSON, error: err }, 'Worker task error');
            clearTimeout(socket._timer);
            var taskParsed = JSON.parse(taskJSON);
            _TaskModel2.default.findById(taskParsed._id, function (err, task) {
                if (err) {
                    _this4.Log.error({ err: err }, 'Error finding task');
                    return;
                }
                if (!task) {
                    _this4.Log.error({ err: err }, 'Could not find task');
                    return;
                }
                task.result = err;
                task.assigned.status = 'error';
                task.save(function (err) {
                    if (err) {
                        _this4.Log.error({ err: err }, 'Error saving task');
                        return;
                    }
                    _this4.Log.info({ task: task }, 'Task completed with error');
                });
            });
        }
    }, {
        key: '_onWorkerTaskAdd',
        value: function _onWorkerTaskAdd(socket, tasks) {
            var _this5 = this;

            tasks = _lodash2.default.isArray(tasks) ? tasks : [tasks];
            _async2.default.each(tasks, function (task, next) {
                var tm = new _TaskModel2.default(task);
                tm.save(function (err) {
                    if (err) {
                        return next(err, task);
                    }

                    _this5.Log.info({ task: task }, 'Task added');
                    next(null, task);
                });
            }, function (err, task) {
                if (err) {
                    socket.emit('task:add:failed', JSON.stringify(task));
                    return _this5.Log.error({ err: err, task: task }, 'Error while adding task');
                }

                socket.emit('task:add:confirm', JSON.stringify(task));

                _this5._assignTasks();
            });
        }
    }, {
        key: '_onWorkerDisconnect',
        value: function _onWorkerDisconnect() {
            this.Log.info('Worker disconnected.  (', this._findWorkers().length, ')');
        }
    }, {
        key: '_onWorkerError',
        value: function _onWorkerError(e) {
            this.Log.info('Worker socket had an error' + e);
        }
    }, {
        key: '_onIOError',
        value: function _onIOError(e) {
            this.Log.info('SocketIO error' + e);
        }
    }, {
        key: '_onDbError',
        value: function _onDbError(err) {
            this.Log.error('Database error: ' + err);
            this.emit('error', err);
        }
    }, {
        key: '_onDbConnect',
        value: function _onDbConnect() {
            this.Log.info('Connected to Database');
            this.emit('info', 'db_connected');
        }
    }, {
        key: '_onDbDisconnect',
        value: function _onDbDisconnect(err) {
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

    }, {
        key: '_findWorkers',
        value: function _findWorkers(namespace, room) {
            var workers = [],
                ns = this._io.of(namespace || "/");

            if (ns) {
                for (var id in ns.connected) {
                    if (room) {
                        var index = ns.connected[id].rooms.indexOf(room);
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

    }, {
        key: '_assignTasks',
        value: function _assignTasks(doNotIncrement) {
            var _this6 = this;

            if (!doNotIncrement) {
                this._assigningTasksCount++;
            }

            if (this._assigningTasksCount > 0 && !this._assigningTasks) {
                this._assigningTasks = true;

                var socket = void 0;
                var task = void 0;

                // While there is an idle worker
                _async2.default.during(function (callback) {
                    // Find an idle worker.
                    socket = _lodash2.default.find(_this6._findWorkers(), function (worker) {
                        return worker._idleWorker;
                    });

                    if (_lodash2.default.isEmpty(socket)) {
                        return callback(null, false);
                    }

                    // Find an available task
                    _this6._findNextTask(function (nextTask) {
                        _this6.Log.info({ task: nextTask, isSocket: !_lodash2.default.isEmpty(socket) }, 'Task found');
                        task = nextTask;
                        return callback(null, !_lodash2.default.isEmpty(nextTask));
                    });
                }, function (next) {
                    // Mark the task as assigned
                    task.assigned.who = socket._workerName || 'workername'; // TODO: Pull the worker name from the socket
                    task.assigned.when = (0, _moment2.default)().unix();
                    task.assigned.status = 'assigned';

                    task.save(function (err) {
                        if (err) {
                            return next(err);
                        }

                        socket._idleWorker = false;
                        socket.emit('task:run', JSON.stringify(task));

                        // Use global timeout unless specific task timeout is set.
                        var taskTimeout = task.timeout || _this6._timeout;
                        var _assignTasks = _this6._assignTasks.bind(_this6);
                        // Set a timer which will deal with workers which die while working.
                        socket._timer = setTimeout(function () {
                            var _this7 = this;

                            // yes, function, see bind
                            var socket = this.socket;
                            var task = this.task;
                            var message = 'Task timed out without response from worker.';
                            var err = 'Task assigned ' + _moment2.default.unix(task.assigned.when).format();
                            socket._idleWorker = true;
                            socket.emit('task:cancel', JSON.stringify(task));
                            this._log.error({ err: err }, message);

                            if (task) {
                                task.assigned.status = 'timeout';

                                task.save(function (err) {
                                    if (err) {
                                        return _this7._log.error({ err: err }, 'Error un-assigning task assignment to mongodb');
                                    }

                                    _assignTasks();
                                });
                            } else {
                                _assignTasks();
                            }
                        }.bind({ task: task, _log: _this6._log, socket: socket }), taskTimeout);

                        // Log that the task was paired and sent.
                        _this6.Log.info({ task: task }, 'Task sent');
                        next();
                    });
                }, function (err) {
                    if (err) {
                        _this6.Log.error({ err: err }, 'Error assigning task');
                    }
                    _this6._assigningTasks = false;
                    _this6._assigningTasksCount--;
                    _this6._assignTasks(true); // Call assign tasks again to make sure we are running it again after a worker has requested and set itself to idle.
                    _this6.Log.info('assignTasks done');
                });
            }
        }

        /**
         * Finds the next available task.
         * Next available task is one that:
         *  - has not been assigned
         *  - is sorted by priority descending
         *  - is sorted by createdAt ascending
         *  and:
         *  - has no dependencies unmet
         */

    }, {
        key: '_findNextTask',
        value: function _findNextTask(callback) {
            var _this8 = this;

            // Find tasks that have not been assigned yet
            _TaskModel2.default.find({ $or: [/* has never been assigned? */
                { $or: [{ assigned: { $exists: false } }, { assigned: null }] },

                /* has been assigned, but returned an error */
                { $and: [{ assigned: { $exists: true } }, { 'assigned.completed': { $exists: false } }, { 'assigned.status': 'error' }] },

                /* has been explicitly marked as timed out */
                { $and: [{ assigned: { $exists: true } }, { 'assigned.completed': { $exists: false } }, { 'assigned.status': 'timeout' }] },

                /* has been assigned, but might have timed out */
                { $and: [{ assigned: { $exists: true } }, { 'assigned.when': { $lte: (0, _moment2.default)().add(-this._timeout, 'ms').unix() } }, { 'assigned.status': 'assigned' }] }] })
            //where('assigned.completed').exists(false)
            .sort('-priority createdAt')
            // Added a limit because there can be millions of unassigned,
            // tasks needing attention which can drastically affect performance.
            //            .limit(1000)
            .exec(function (err, unassignedTasks) {
                if (err) {
                    return _this8.Log.error(err, 'Unable to connect to database to get an unassigned task');
                }
                _this8.Log.info(unassignedTasks.length, 'Unassigned task count');
                // Find a task whose dependencies are complete
                // TODO: Since there is now a limit on the initial tasks called,
                // we need to account for not having the full list when checking.
                _async2.default.detectSeries(unassignedTasks, function (unassignedTask, next) {
                    _this8._log.info({ unassignedTask: unassignedTask }, "Considering unassigned");
                    // Check if assign and if assigned if the assignment has not expired if so return false.
                    if (unassignedTask.assigned && unassignedTask.assigned.when) {
                        var taskTimeout = unassignedTask.timeout || _this8._timeout;
                        if (_moment2.default.unix(unassignedTask.assigned.when).isAfter((0, _moment2.default)().add(taskTimeout, 'ms'))) {
                            _this8._log.info({ timedOutTask: unassignedTask }, "Task has timed out, re-assigning!");
                            return next(false);
                        } else {
                            _this8._log.info({ timedOutTask: unassignedTask,
                                taskTimeout: taskTimeout }, "Task has timed out!???!");
                        }
                    }
                    if (unassignedTask.dependencies && unassignedTask.dependencies.length > 0) {
                        _this8._log.info({ deps: unassignedTask.dependencies }, 'dependencies');
                        _TaskModel2.default.where('assigned.status="done"').or(unassignedTask.dependencies).exec(function (err, completedDependencyTasks) {
                            if (err) {
                                return _this8.Log.error(err, 'Unable to connect to database to get dependencies');
                            }
                            _this8._log.info({ completed: completedDependencyTasks }, completedDependencyTasks.length, 'Completed dependencies');
                            // If every dependency matches any completedDependency then we have found the next task
                            return next(_lodash2.default.every(unassignedTask.dependencies, function (dependency) {
                                return _lodash2.default.some(completedDependencyTasks, function (completedDependencyTask) {
                                    return _lodash2.default.isMatch(completedDependencyTask.toObject(), dependency);
                                });
                            }));
                        });
                    } else {
                        return next(true);
                    }
                }, function (taskToAssign) {
                    callback(taskToAssign);
                });
            });
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
    }]);

    return Master;
}(_events2.default);

exports.default = Master;