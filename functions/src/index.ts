/**
 * Firebase Functions entry point for the Hono API server
 */

import {setGlobalOptions} from "firebase-functions";
import {onRequest} from "firebase-functions/https";
import {app} from "./app";

// Set global options for all functions
setGlobalOptions({maxInstances: 10});

// Simple adapter to handle Firebase Functions -> Hono
export const api = onRequest(async (req, res) => {
  // Convert Firebase request to Web Request
  const url = new URL(req.url || "/", `https://${req.headers.host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
  }

  const body = ["GET", "HEAD"].includes(req.method || "GET") ?
    undefined :
    JSON.stringify(req.body);

  const request = new Request(url.toString(), {
    method: req.method,
    headers,
    body,
  });

  // Get response from Hono
  const response = await app.fetch(request);

  // Set response status and headers
  res.status(response.status);
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  // Send response body
  const responseBody = await response.text();
  res.send(responseBody);
});
