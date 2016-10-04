'use strict';
const got = require('got');
const debug = require('debug')('manifest');
const urljoin = require('url-join');
const xray = require('x-ray');

const nightmareElectron = require('x-ray-nightmare');
const nightmareDriver = nightmareElectron();
const x = xray().driver(nightmareDriver);

let nightmareDestroyed = false;
var xDone = function () {
    if (nightmareDestroyed) {
        return;
    }
    nightmareDestroyed = true;
    nightmareDriver();
};

var manifestCache = {};

var parseManifestAsObject = data => {
    if (typeof data === 'object') {
        return Promise.resolve({
            json: true,
            data: data
        });
    }

    if (typeof data === 'string' || (data || '').trim()[0] === '{') {
        // likely a JSON string that needs to be parsed to an object
        try {
            return Promise.resolve({
                json: true,
                data: JSON.parse(data)
            });
        } catch (e) {
            if (e.name === 'SyntaxError') {
                return Promise.resolve({
                    json: false,
                    data: data,
                    error: new Error('Could not parse manifest as JSON')
                });
            }
        }
    }

    return Promise.resolve({
        json: false,
        data: data,
        error: new Error('Unrecognized "' + typeof data + '" type for manifest/app URL')
    });
};

var crawlManifest = appUrl => {
    return Promise.reject('x');
    return got(appUrl, {json: true})
        .then(res => {
            // found a manifest!
            debug(null, 'Parsed URL as manifest: ' + appUrl);
            return fetchManifest(res.body);
        }, err => {
            var errMsg = new Error('Could not fetch manifest: ' + err.message);
            debug(err, err.message);

            if (err instanceof got.ParseError) {
                debug(err, errMsg.message);

                return fetchXRay(err.response.url);

                // crawl the URL as an HTML doc
                // (which could possibly have a
                // `link[rel=manifest]` tag injected by JS)!

                // TODO: walk up to the host root!
                // var rootManifestUrl = urljoin(appUrl, '..');
                // return fetchManifestJson(rootManifestUrl);
            } else {
                return Promise.reject(errMsg);
            }
        });
};

var fetchXRay = appUrl => {
    return x(appUrlToParse, 'link[rel=manifest]@href')((err, manifestUrl) => {
        xDone();

        debug(err, 'Could not crawl link[rel=manifest] URL: ' + manifestUrl);

        if (err) {
            throw new Error(err);
        }

        return crawlManifest(manifestUrl);
    });
};

var fetchManifest = module.exports = appUrl => {
    if (appUrl && appUrl in manifestCache) {
        return Promise.resolve(manifestCache[appUrl]);
    }

    return parseManifestAsObject(appUrl).then(manifest => {
        if (manifest.json) {
            return manifest.data;
        }

        // likely a URL string
        return crawlManifest(appUrl);
    }).catch(err => {
        debug(err, 'Could not parse manifest, so will crawl: ' + appUrl);
    });
};
