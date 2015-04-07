"use strict";

var express = require("express"),
    webApp = express(),
    AppManager = require("./app-manager");


var appManager = new AppManager("/private/tmp/apps");


webApp.param("appName", function (req, res, next, appName) {
    var app = appManager.getApp(appName);
    if (app) {
        req.params.app = app;
        next();
    } else {
        next("route");
    }
});

webApp.get("/api/:appName", function (req, res, next) {
    req.params.app.getStatus()
        .then(function (status) {
            res.json(status);
        })
        .catch(next)
        .done();
});

webApp.post("/api/:appName/start", function (req, res, next) {
    req.params.app.start()
        .then(function () {
            res.json({started: true});
        })
        .catch(next)
        .done();
});

webApp.post("/api/:appName/stop", function (req, res, next) {
    req.params.app.stop()
        .then(function () {
            res.json({stopped: true});
        })
        .catch(next)
        .done();
});

//webApp.post("/api/:appName/restart", function (req, res, next) {
//    req.params.app.restart()
//        .then(function () {
//            res.json({restarted: true});
//        })
//        .catch(next)
//        .done();
//});

webApp.post("/api/:appName/switch-to/:version", function (req, res, next) {
    var toVersion = parseInt(req.params.version, 10);
    req.params.app.switchToVersion(toVersion)
        .then(function () {
            res.json({switched: true});
        })
        .catch(next)
        .done();
});

var webServer = webApp.listen(3000);

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