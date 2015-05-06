"use strict";

var express = require("express"),
    bodyParser = require("body-parser"),
    _ = require("lodash"),
    config = require("./config"),
    webApp = express(),
    AppManager = require("./app-manager");

var appManager = new AppManager(config.get("apps_path"));

webApp.use(bodyParser.json());

webApp.param("appName", function (req, res, next, appName) {
    var app = appManager.getApp(appName);
    if (app) {
        req.params.app = app;
        next();
    } else {
        next("route");
    }
});

webApp.get("/api/apps", function (req, res, next) {
    res.json(Object.keys(appManager.apps));
});

webApp.put("/api/apps/:newAppName", function (req, res, next) {
    appManager.createApp(req.params.newAppName, _.extend({}, _.pick(req.body, "env")))
        .then(function () {
            res.json({created: true});
        })
        .catch(next)
        .done();
});

webApp.get("/api/apps/:appName", function (req, res, next) {
    req.params.app.getStatus()
        .then(function (status) {
            res.json(status);
        })
        .catch(next)
        .done();
});

webApp.post("/api/apps/:appName/start", function (req, res, next) {
    req.params.app.start()
        .then(function () {
            res.json({started: true});
        })
        .catch(next)
        .done();
});

webApp.post("/api/apps/:appName/stop", function (req, res, next) {
    req.params.app.stop()
        .then(function () {
            res.json({stopped: true});
        })
        .catch(next)
        .done();
});

webApp.post("/api/apps/:appName/restart", function (req, res, next) {
    var app = req.params.app;
    app.stop()
        .then(function () {
            return app.start();
        })
        .then(function () {
            res.json({restarted: true});
        })
        .catch(next)
        .done();
});

webApp.post("/api/apps/:appName/switch-to/:version", function (req, res, next) {
    var toVersion = parseInt(req.params.version, 10);
    req.params.app.switchToVersion(toVersion)
        .then(function () {
            res.json({switched: true});
        })
        .catch(next)
        .done();
});

// tar -zcf - ./ | curl -v --data-binary "@-" http://127.0.0.1:3000/api/apps/test-app/deploy
webApp.post("/api/apps/:appName/deploy", function (req, res, next) {
    var noSwitch = parseInt(req.query.noSwitch, 10) === 1,
        app = req.params.app;

    app.deploy(req)
        .then(function (newVersion) {
            if (!noSwitch) {
                return app.switchToVersion(newVersion);
            }
        })
        .then(function () {
            res.json({deployed: true});
        })
        .catch(next)
        .done();
});

webApp.post("/api/apps/:appName", function (req, res, next) {
    var app = req.params.app;
    app.getConfig()
        .then(function (cfg) {
            var toStore = cfg,
                newEnv = req.body && req.body.env || {};

            if (parseInt(req.query['clear-set'], 10) === 1) {
                toStore.env = _.extend({}, newEnv);
                console.log("With clear", req.query);
            } else {
                toStore.env = _.extend({}, cfg.env, newEnv);
                console.log("Without clear", req.query);
            }

            return app.setConfig(toStore);
        })
        .then(function (storedCfg) {
            res.json(storedCfg);
        })
        .catch(next)
        .done();
});

webApp.use(function (err, req, res, next) {
    if (req.is("json")) {
        res.status(503);
        res.json({error: err.message});
    } else {
        next(err);
    }
});

var webServer = webApp.listen(config.get("port"));

function stopServer(e) {
    if (e) {
        console.error("Stopping server: ", e);
    } else {
        console.log("Stopping server.");
    }
    webServer.close();
    appManager.stop()
        .finally(process.exit)
        .done();
}

appManager.start()
    .catch(stopServer)
    .done();

process.on("SIGINT", stopServer);
process.on("SIGQUIT", stopServer);