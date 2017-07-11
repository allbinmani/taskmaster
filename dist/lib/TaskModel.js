'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _mongoose = require('mongoose');

var _mongoose2 = _interopRequireDefault(_mongoose);

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var taskSchema = new _mongoose2.default.Schema({
    "created": { type: Number, default: (0, _moment2.default)().unix(), index: true },
    "priority": { type: Number, default: 50, index: true },
    "timeout": Number,
    "assigned": {
        "who": String,
        "when": Number,
        "completed": Number,
        "status": String
    },
    "module": { type: String, index: true },
    "result": _mongoose2.default.Schema.Types.Mixed,
    "params": [_mongoose2.default.Schema.Types.Mixed],
    "dependencies": [_mongoose2.default.Schema.Types.Mixed]
});

taskSchema.index({ module: 1, params: 1 }, { unique: true });
exports.default = _mongoose2.default.model('Task', taskSchema);