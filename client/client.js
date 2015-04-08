module.exports = (function () {
    "use strict";

    var when = require("when");

    function toEntity(res) {
        // TODO check for error
        return res.entity;
    }

    function toError(res) {
        if (res.entity && res.entity.error) {
            return when.reject(new Error(res.entity.error));
        } else if (res.error instanceof Error) {
            return when.reject(res.error);
        }
        return when.reject(new Error(res.entity));
    }

    function BegiksClient(endpoint) {
        var rest = require("rest"),
            mime = require("rest/interceptor/mime"),
            errorCode = require("rest/interceptor/errorCode"),
            prefix = require("rest/interceptor/pathPrefix");

        var client = rest.wrap(mime, {mime: 'application/json'})
            .wrap(errorCode)
            .wrap(prefix, {prefix: endpoint});

        this.getApps = function bcGetApps() {
            return client({path: "/api/apps", method: "GET"})
                .then(toEntity).catch(toError);
        };

        this.getAppStats = function bcGetAppStats(appName) {
            return client({path: "/api/apps/{appName}", method: "GET", params: {appName: appName}})
                .then(toEntity).catch(toError);
        };

        this.createApp = function bcCreateApp(appName, config) {
            return client({path: "/api/apps/{appName}", method: "PUT", entity: config, params: {appName: appName}})
                .then(toEntity).catch(toError);
        };

        this.startApp = function bcStartApp(appName) {
            return client({path: "/api/apps/{appName}/start", method: "POST", params: {appName: appName}})
                .then(toEntity).catch(toError);
        };

        this.stopApp = function bcStopApp(appName) {
            return client({path: "/api/apps/{appName}/stop", method: "POST", params: {appName: appName}})
                .then(toEntity).catch(toError);
        };

        this.restartApp = function bcRestartApp(appName) {
            return client({path: "/api/apps/{appName}/restart", method: "POST", params: {appName: appName}})
                .then(toEntity).catch(toError);
        };

        this.switchAppVersionTo = function bcSwitchAppVersionTo(appName, version) {
            return client({
                path: "/api/apps/{appName}/switch-to/{version}",
                method: "POST",
                params: {appName: appName, version: version}
            }).then(toEntity).catch(toError);
        };

        this.setAppConfig = function bcSetAppConfig(appName, config) {
            return client({path: "/api/apps/{appName}", method: "POST", entity: config, params: {appName: appName}})
                .then(toEntity).catch(toError);
        };

        this.deployApp = function bcDeployApp(appName, opts) {
            var defer = when.defer(),
                archiver = require("archiver"),
                url = require("url"),
                http = require("http"),
                archive = archiver("tar", {gzip: true}),
                httpOpts = url.parse(endpoint),
                path = require("path"),
                _ = require("lodash");

            function parseResponse(d) {
                return function (res) {
                    var body = "";
                    res.on('data', function (chunk) {
                        body += chunk.toString();
                    });
                    res.on("end", function () {
                        try {
                            var r = JSON.parse(body);
                            d.resolve(r);
                        } catch (e) {
                            d.reject(e);
                        }
                    });
                };
            }

            var options = _.pick(httpOpts, "hostname", "port", "path"),
                query = [];
            if (opts.noSwitch) {
                query.push("noSwitch=1");
            }

            options.path = path.join(options.path, "api/apps", appName, "deploy") + "?" + query.join("&");
            options.method = "POST";
            options.headers = {
                "Content-Type": "application/x-gzip"
            };

            var req = http.request(options, parseResponse(defer));

            archive.on("error", defer.reject);

            archive.pipe(req);

            var files = {
                expand: true,
                cwd: opts.path,
                src: ["**"].concat((opts.exclude || []).map(function (ex) {
                    return "!" + ex;
                })),
                dest: "./"
            };

            archive.bulk(files).finalize();

            return defer.promise;
        };
    }

    return BegiksClient;
})();