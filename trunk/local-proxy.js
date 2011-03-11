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
});

var opts = require('tav').set();

if (opts.remote) {
	REMOTE_PROXY_HOST = opts.remote;
}

http.createServer(function (req, res) {
	// console.log(req);
	// console.log("Request Headers:", req.headers);

	var headers = req.headers;
	var u       = url.parse(req.url);
	var host    = headers['host'];
	var search  = u.search || '';

	// console.log("url:", u);

	// Reject the request if it is anything other than http://
	if (u.protocol != "http:") {
		res.writeHead(503, "This proxy serves only HTTP requests");
		res.write("503 This proxy serves only HTTP requests. You tried: " + u.protocol);
		res.end();
		return;
	}

	// The remote request object
	var rreq = https.request({
		host: REMOTE_PROXY_HOST, 
		port: 443, 
		path: u.pathname + search, 
		method: req.method
	}, function (remote) {
		// console.log("REMOTE:", remote);
		var rheaders = remote.headers;

		res.writeHead(remote.statusCode, rheaders);

		// Pipe all data from source (remote) to destination (res)
		remote.pipe(res);

		remote.on('error', function() {
			console.log("Error getting HTTPS response:", arguments);
			// Don't forget to destroy the server's response stream
			res.destroy();
		});
	});

	rreq.on('error', function() {
		console.log("Error connecting to remote proxy:", arguments);
		res.writeHead(444, "No Response");
		res.end();
	});

	// Prevent cross domain referer leakage
	if (headers.referer) {
		var ru = url.parse(headers.referer);
		if (ru.hostname != u.hostname) {
			headers.referer = u.protocol + "//" + u.hostname + "/";
		}
	}

	// Write out the headers
	map_hash(headers, hitch(rreq, rreq.setHeader));

	// Pipe the request from the real client (req) to the remote proxy (rreq)
	req.pipe(rreq);

	// Destroy the stream on error
	req.on('error', function() {
		console.log("Error sending data to client:", arguments);
		res.destroy();
	});

}).listen(8080);
