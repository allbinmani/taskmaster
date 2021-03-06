'use strict';
/**
 * Created by Online By Design LLC.
 *
 * This loads up either the master or the runner depending on what the role of this instance is.
 */
var _ = require('lodash');
var config = _.defaults(require('./config.json'), {
    "version": 1,
    "role": "runner",

    "master": {
        "port": 3000,
        "host": "localhost",
        "mongoURL": "mongodb://localhost/taskrunner"
    },
    "runner": {
        "name": "archon", // TODO: Have runner automatically determine this by hostname
        "maxWorkers": 2, // TODO: Have runner automatically determine this default based on CPU Cores
        "taskFolder": "tasks",
        "worker": {
            "timeout": 300000 // 5 min
        }
    }
});

/**
 * start app based on config file
 */
if (process.argv[2] === 'master' || config.role === 'master') {
    require('./lib/master')(config);
} else if (config.role === 'runner') {
    require('./lib/runner')(config);
}