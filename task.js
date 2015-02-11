/**
 * Created by James on 2/10/2015.
 */

var util = require("util");
var ee = require("events").EventEmitter;

var Task = function (task, params, options) {
    options.timeout = options.timeout || 300000; // 5 minutes is the default timeout time

    ee.call(this);

    // timer will trigger an error if options.timeout expires before task emits 'done'.
    this.timer = setTimeout((function () {
        this.error('Task timed out');
    }).bind(this), options.timeout);


    // Run the task
    var taskScript = require('./tasks/' + task);
    taskScript.apply(this, params);
};
util.inherits(Task, ee);

Task.prototype.run = function () {
    this.emit('run', msg);
};

Task.prototype.done = function (msg) {
    clearTimeout(this.timer);
    this.emit('done', msg);
};

Task.prototype.error = function (msg) {
    this.emit('error', msg);
    
};

module.exports = Task;