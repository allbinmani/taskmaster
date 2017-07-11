
import EventEmitter from 'events';
import SocketIO from 'socket.io';
import Mongoose from 'mongoose';
import Async from 'async';
import bunyan from 'bunyan';

export default class Task extends EventEmitter
{
	/**
	  * @abstract
	  */
	static run(params) {

	}
}