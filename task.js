'use strict';

let EventEmitter = require('events');
let bunyan = require('bunyan');

let taskFolder = process.env.TASK_FOLDER || 'tasks';

let ee = new EventEmitter();
let log = bunyan.createLogger({name: 'task'});
let task;

//process.chdir(taskFolder);

let sendError = (err) => {
    process.send({command: 'error', err: err});
};

process.on('message', function(message) {
    if (message.command === 'run') {
        task = message.task;
        try {
            log.info({taskFolder: taskFolder, taskModule: task.module}, 'Running actual task');
            let fullPath = './' + taskFolder + '/' + task.module;
            log.info({path: fullPath}, "Task script");
            let taskScript = require(fullPath);
            taskScript.apply(ee, task.params);
        } catch (err) {
            sendError(err.stack);
        }
    }
});

/**
 * When the task is done processing.
 */
ee.on('done', function (result) {
	// Send message back to Worker
    process.send({command: 'done', result: result});
});

/**
 * When the task has a task error
 */
ee.on('error', function(err) {
	log.error('Task error', err);
    sendError(err);
});

/**
 * Allows the task to add a task if it needs one.
 */
ee.on('add', function(newTask) {
	// Propagate message back to Worker
    process.send({command: 'add', task: newTask});
});
