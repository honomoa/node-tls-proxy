/*
 * Copyright (c) 2011 Dhruv Matani
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

var http  = require('http');
var https = require('https');
var url   = require('url');
var fs    = require('fs');
var dns   = require('dns');

var TIMEOUT_SEC = 120;


function map_hash(m, mapper) {
	var r = { };
	for (var k in m) {
		r[k] = mapper(k, m[k]);
	}
	return r;
}

function hitch(obj, proc) {
	return function() {
		return proc.apply(obj, arguments);
	};
}

/* Try to not catch unhandled exceptions in the hope of tracking line numbers */
process.on('uncaughtException', function (err) {
	console.log('(un)Caught exception: ', err.stack);
});


var https_options = {
	key: fs.readFileSync('./openSSL_keys/ryans-key.pem'), 
	cert: fs.readFileSync('./openSSL_keys/ryans-cert.pem')
};

var opts = require('tav').set();

if (opts.timeout) {
	TIMEOUT_SEC = parseInt(opts.timeout < 60 ? 60 : opts.timeout);
}


var np_req = 0;


https.createServer(https_options, function (req, res) {
	// console.log(req);
	// console.log("Request Headers:", req.headers);
	++np_req;

	console.log(np_req, "Requesting URL:", req.url);

	var headers = req.headers;
	var u       = url.parse(req.url);
	var host    = headers['host'];
	var port    = u.port || 80;
	var search  = u.search || '';
	var _terminated = false;

	// console.log("host:", host);
	// console.log("url:", u);

	// Create an timeout object to timeout our connection if there is
	// no data transfer happening for TIMEOUT_SEC second.
	var to_interval = null;

	var agent = http.getAgent(host, port);
	agent.maxSockets = 32;


	/* Reset the timeout so that we start counting once again after
	 * any activity has occurred.
	 */
	function reset_timeout() {
		if (to_interval) {
			clearTimeout(to_interval);
		}

		to_interval = setTimeout(function() {
			rreq.emit('error');
		}, TIMEOUT_SEC * 1000);
	}

	reset_timeout();

	function terminate_request(streams) {
		if (!_terminated) {
			_terminated = true;
			--np_req;
			clearTimeout(to_interval);

			streams.forEach(function(stream) {
				// stream.destroy();
				stream.emit('error');
			});
		}
	}

	// The remote request object
	var rreq = http.request({
		host: host, 
		port: port, 
		path: u.pathname + search, 
		method: req.method
	}, function (rres) {
		// console.log("rres:", rres);
		var rheaders = rres.headers;

		// Remove the "Content-Encoding" header.
		// if (rheaders['content-encoding']) {
			// delete rheaders['content-encoding'];
		// }

		res.writeHead(rres.statusCode, rheaders);

		// Pipe all data from source (rres) to destination (res)
		// rres.pipe(res);

		rres.on('data', function(d) {
			res.write(d);
			reset_timeout();
		})
		.on('end', function() {
			--np_req;
			console.log(np_req, "Received Complete Response for URL:", req.url);
			clearTimeout(to_interval);
			_terminated = true;
			res.end();
		});

		rres.on('error', function() {
			console.log("Error getting HTTP response:", arguments);
			// Don't forget to destroy the server's response stream
			terminate_request([res]);
		});
	});

	// console.log("RREQ:", rreq);

	rreq.on('error', function() {
		console.error("Error connecting:", arguments);
		terminate_request([res]);
	});

	// Write out the headers.
	// Set the "Accept-Encoding" header.
	// headers['accept-encoding'] = 'gzip,deflate';
	map_hash(headers, hitch(rreq, rreq.setHeader));

	// Pipe the result from the local proxy (req) to the actual host (rreq)
	// req.pipe(rreq);
	req.on('data', function(d) {
		rreq.write(d);
		reset_timeout();
	})
	.on('end', function() {
		rreq.end();
	});

	// Destroy the stream on error
	req.on('error', function() {
		console.log("Error sending data to client:", arguments);
		terminate_request([rreq]);
	});

}).listen(443);


