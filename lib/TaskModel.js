import Mongoose from 'mongoose';
import moment from 'moment';

const taskSchema = new Mongoose.Schema({
    "priority": {type: Number, default: 50, index: true},
    "timeout": Number,
    "assigned": {
        "who": String,
        "when": Number,
        "completed": Number,
        "status": String
    },
    "module": {type: String, index: true},
    "result": Mongoose.Schema.Types.Mixed,
    "params": [Mongoose.Schema.Types.Mixed],
    "dependencies": [Mongoose.Schema.Types.Mixed]
}, {timestamps: true});

taskSchema.index({module:1, params: 1}, {unique: true});
export default Mongoose.model('Task', taskSchema);
