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

var REMOTE_PROXY_HOST = "localhost";
var REMOTE_PROXY_PORT = 443;

var TIMEOUT_SEC = 90;

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

process.on('uncaughtException', function (err) {
	console.log('(un)Caught exception: ' + err);
	console.log(err.stack);
});

var opts = require('tav').set();

if (opts.remote) {
	var h, p;
	var hp = opts.remote.match(/([^:]+)(:(.+))?/);
	REMOTE_PROXY_HOST = hp[1];
	REMOTE_PROXY_PORT = parseInt(hp[3] || REMOTE_PROXY_PORT);
}

if (opts.timeout) {
	TIMEOUT_SEC = parseInt(opts.timeout < 60 ? 60 : opts.timeout);
}


setInterval(function() {
    console.log("Request Queue:", agent.queue);
}, 10000);

var np_req = 0;


http.createServer(function (req, res) {
	// console.log(req);
	// console.log("Request Headers:", req.headers);

	var headers = req.headers;
	var u       = url.parse(req.url);
	var host    = headers['host'];
	var search  = u.search || '';
	var _terminated = false;

	// console.log("url:", u);

	// Reject the request if it is anything other than http://
	if (u.protocol != "http:") {
		res.writeHead(503, "This proxy serves only HTTP requests");
		res.write("503 This proxy serves only HTTP requests. You tried: " + u.protocol);
		res.end();
		return;
	}

	++np_req;

	console.log(np_req, "Requesting URL:", req.url);

	// Create an timeout object to timeout our connection if there is
	// no data transfer happening for TIMEOUT_SEC second.
	var to_interval = null;
	
	function reset_timeout() {
		unset_timeout();

		to_interval = setTimeout(function() {
			console.error("Timing out request:", req.url);
			preq.destroy();
		}, TIMEOUT_SEC * 1000);
	}

	function unset_timeout() {
		// console.log("clearing Timeout for:", host + req.url);
		if (to_interval) {
			clearTimeout(to_interval);
			to_interval = null;
		}
	}

	reset_timeout();

	function terminate_request(streams) {
		if (!_terminated) {
			--np_req;
			console.error(np_req, "Hard terminating request:", req.url);
			_terminated = true;
			clearTimeout(to_interval);

			streams.forEach(function(stream) {
				stream.destroy();
			});
		}
	}

	// The remote request object
	var preq = https.request({
	    host: REMOTE_PROXY_HOST, 
	    port: REMOTE_PROXY_PORT, 
	    path: u.pathname + search, 
	    method: req.method, 
	    agent: false
	}, function (pres) {
		// console.log("pres:", pres);
		var rheaders = pres.headers;

		res.writeHead(pres.statusCode, rheaders);

		// Pipe all data from source (pres) to destination (res)
		pres.on('data', function(d) {
			res.write(d);
			reset_timeout();
		})
		.on('end', function() {
			if (_terminated) {
				throw "Calling end on a terminated request";
				console.error("Calling END on a terminated request");
				process.exit();
			}
			--np_req;
			console.log(np_req, "Received Complete Response for URL:", req.url);
			clearTimeout(to_interval);
			res.end();
		});

		pres.on('error', function() {
			console.log("Error getting HTTPS response:", arguments);
			// Don't forget to destroy the server's response stream
			terminate_request([res]);
		});
	});

	preq.on('error', function() {
		console.log("Error connecting to remote proxy:", arguments);
		terminate_request([res]);
	});

	// Prevent cross domain referer leakage
	if (headers.referer) {
		var ru = url.parse(headers.referer);
		if (ru.hostname != u.hostname) {
			headers.referer = u.protocol + "//" + u.hostname + "/";
		}
	}

	// Write out the headers
	map_hash(headers, hitch(preq, preq.setHeader));

	// Pipe the request from the real client (req) to the remote proxy (preq)
	// req.pipe(preq);
	req.on('data', function(d) {
		preq.write(d);
		reset_timeout();
	})
	.on('end', function() {
		preq.end();
	});

	// Destroy the stream on error
	req.on('error', function() {
		console.log("Error sending data to client:", arguments);
		terminate_request([preq]);
	});

}).listen(8080);

