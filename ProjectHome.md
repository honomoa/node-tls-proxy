A HTTP[S](S.md) proxy to route all HTTP traffic securely to the external network (based on [node.js](http://nodejs.org/))

The general idea is mentioned here: [Using HTTPS for all browsing](http://dhruvbird.blogspot.com/2011/03/https-for-all-browsing.html)

To get started:
  1. Copy remote-proxy.js to a remote machine that you trust to not be packet sniffed by anyone.
  1. Start it by typing "node remote-proxy.js"
  1. Run local-proxy.js on your machine by typing: "node local-proxy.js --remote=REMOTE\_PROXY\_HOST\_NAME\_OR\_IP"
  1. Go to Firefox/Chrome (or whatever your browser is) and set ONLY the HTTP proxy to localhost port 8080.
  1. DO NOT set any other proxy (even HTTPS) to localhost port 8080.
  1. DO NOT forget to replace the SSL keys with your own (self generated keys that is)
  1. That's it. All traffic from your machine is now secure from local packet sniffers.

[A thread on reddit praising/bashing the idea/app](http://www.reddit.com/r/programming/comments/fzu0c/ive_created_an_https_based_proxy_for_relatively/). Use this to comment.